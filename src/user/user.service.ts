import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { ADMIN_USER_IDENTITY_SELECT } from '../common/constants/admin-user-select';
import { AdminQueryUsersDto } from './dto/admin-query-users.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import {
  Prisma,
  UserRole,
  UserStatus,
  TransactionType,
  TransactionStatus,
} from '@prisma/client';
import { GetTransactionsDto } from '../wallet/dto/get-transactions.dto';
import { ErrorMessages } from '../common/constants/error-messages';
import { RedisService } from '../redis/redis.service';
import { AddressComponentsDto } from './dto/shared-address-components.dto';
import { classifyCustomerLifecycle, classifyCustomerValue, getCustomerValueThresholds, CustomerLifecycle, CustomerValue } from '../common/utils/customer-status.util';

interface CustomerUsersFilterParams {
  query?: string;
  branchIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  signupSource?: 'WEB' | 'APP';
  accountStatus?: 'ACTIVE' | 'INACTIVE';
  serviceMode?: 'HOME_SERVICE' | 'WALK_IN';
  lifecycle?: CustomerLifecycle;
  value?: CustomerValue;
  minVisits?: number;
  maxVisits?: number;
  minSpend?: number;
  maxSpend?: number;
  minAvgSpend?: number;
  maxAvgSpend?: number;
  firstVisitFrom?: string;
  firstVisitTo?: string;
  lastVisitFrom?: string;
  lastVisitTo?: string;
  daysSinceLastVisitMin?: number;
  daysSinceLastVisitMax?: number;
  serviceCategoryIds?: string[];
  serviceIds?: string[];
  page?: number;
  limit?: number;
}

interface AddressRecord {
  id: string;
  userId: string;
  label: string | null;
  fullAddress?: string;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  placeId?: string | null;
  addressComponents?: unknown;
  latitude?: { toNumber?: () => number } | number | null;
  longitude?: { toNumber?: () => number } | number | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) { }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        emailVerified: true,
        adminRoleId: true,
        adminRole: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
    }

    return user;
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateProfileDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    void this.redis.del(`user:profile:${userId}`);
    void this.redis.del(`beautician:me:stable:${userId}`);

    return user;
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    // Get user with password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
    }

    // Verify current password
    const isPasswordValid = await argon2.verify(user.password, currentPassword);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 4,
      parallelism: 1,
    });

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  // Address Management (soft delete via deletedAt)
  private readonly activeAddressWhere = { deletedAt: null } as const;

  async getAddresses(userId: string) {
    const addresses = (await this.prisma.address.findMany({
      where: { userId, ...this.activeAddressWhere },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })) as AddressRecord[];

    return addresses.map((address) => this.formatAddress(address));
  }

  async getAddressById(userId: string, addressId: string) {
    const address = (await this.prisma.address.findFirst({
      where: { id: addressId, userId, ...this.activeAddressWhere },
    })) as AddressRecord | null;

    if (!address) {
      throw new NotFoundException(ErrorMessages.ADDRESS_NOT_FOUND);
    }

    return this.formatAddress(address);
  }

  async createAddress(userId: string, createAddressDto: CreateAddressDto) {
    const resolvedAddress = this.resolveAddressValues(createAddressDto);

    const address = await this.prisma.$transaction(async (tx) => {
      const addressCount = await tx.address.count({
        where: { userId, ...this.activeAddressWhere },
      });
      const shouldBeDefault =
        createAddressDto.isDefault !== undefined
          ? createAddressDto.isDefault
          : addressCount === 0;

      if (shouldBeDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, ...this.activeAddressWhere },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          userId,
          label: resolvedAddress.label,
          fullAddress: resolvedAddress.fullAddress,
          streetAddress: resolvedAddress.streetAddress,
          city: resolvedAddress.city,
          state: resolvedAddress.state,
          country: resolvedAddress.country,
          placeId: resolvedAddress.placeId,
          addressComponents: resolvedAddress.addressComponents,
          latitude: resolvedAddress.latitude,
          longitude: resolvedAddress.longitude,
          isDefault: shouldBeDefault,
        },
      }) as any;
    });

    return this.formatAddress(address);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    updateAddressDto: UpdateAddressDto,
  ) {
    // Check if address exists, belongs to user, and is not soft-deleted
    const existingAddress = (await this.prisma.address.findFirst({
      where: { id: addressId, userId, ...this.activeAddressWhere },
    })) as AddressRecord | null;

    if (!existingAddress) {
      throw new NotFoundException(ErrorMessages.ADDRESS_NOT_FOUND);
    }

    const resolvedAddress = this.resolveAddressValues(
      updateAddressDto,
      existingAddress,
    );

    const address = await this.prisma.$transaction(async (tx) => {
      if (updateAddressDto.isDefault === true) {
        await tx.address.updateMany({
          where: {
            userId,
            isDefault: true,
            id: { not: addressId },
            ...this.activeAddressWhere,
          },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data: {
          ...(resolvedAddress.label !== undefined && {
            label: resolvedAddress.label,
          }),
          ...(resolvedAddress.fullAddress !== undefined && {
            fullAddress: resolvedAddress.fullAddress,
          }),
          ...(resolvedAddress.streetAddress !== undefined && {
            streetAddress: resolvedAddress.streetAddress,
          }),
          ...(resolvedAddress.city !== undefined && {
            city: resolvedAddress.city,
          }),
          ...(resolvedAddress.state !== undefined && {
            state: resolvedAddress.state,
          }),
          ...(resolvedAddress.country !== undefined && {
            country: resolvedAddress.country,
          }),
          ...(resolvedAddress.placeId !== undefined && {
            placeId: resolvedAddress.placeId,
          }),
          ...(resolvedAddress.addressComponents !== undefined && {
            addressComponents: resolvedAddress.addressComponents,
          }),
          latitude: resolvedAddress.latitude,
          longitude: resolvedAddress.longitude,
          ...(updateAddressDto.isDefault !== undefined && {
            isDefault: updateAddressDto.isDefault,
          }),
        },
      }) as any;
    });

    return this.formatAddress(address);
  }

  async setDefaultAddress(userId: string, addressId: string) {
    const existingAddress = (await this.prisma.address.findFirst({
      where: { id: addressId, userId, ...this.activeAddressWhere },
    })) as AddressRecord | null;

    if (!existingAddress) {
      throw new NotFoundException(ErrorMessages.ADDRESS_NOT_FOUND);
    }

    const address = await this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, isDefault: true, ...this.activeAddressWhere },
        data: { isDefault: false },
      });

      return tx.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });

    return this.formatAddress(address);
  }

  async deleteAddress(userId: string, addressId: string) {
    const existingAddress = (await this.prisma.address.findFirst({
      where: { id: addressId, userId, ...this.activeAddressWhere },
    })) as AddressRecord | null;

    if (!existingAddress) {
      throw new NotFoundException(ErrorMessages.ADDRESS_NOT_FOUND);
    }

    const deletedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.address.update({
        where: { id: addressId },
        data: {
          deletedAt,
          isDefault: false,
        },
      });

      if (existingAddress.isDefault) {
        const replacementAddress = await tx.address.findFirst({
          where: { userId, ...this.activeAddressWhere },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        });

        if (replacementAddress) {
          await tx.address.update({
            where: { id: replacementAddress.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return { message: 'Address deleted successfully' };
  }

  private formatAddress(address: AddressRecord) {
    const addressComponents = this.extractAddressComponents(
      address.addressComponents,
    );

    const streetAddress =
      address.streetAddress ?? addressComponents?.streetAddress ?? null;

    const city = address.city ?? addressComponents?.city ?? null;
    const state = address.state ?? addressComponents?.state ?? null;
    const country = address.country ?? addressComponents?.country ?? 'Nigeria';
    const fullAddress =
      address.fullAddress ||
      this.joinAddressParts([streetAddress, city, state, country]);

    return {
      id: address.id,
      label: address.label,
      fullAddress,
      streetAddress,
      city,
      state,
      country,
      placeId: address.placeId,
      latitude: this.toCoordinateNumber(address.latitude),
      longitude: this.toCoordinateNumber(address.longitude),
      addressComponents: addressComponents ?? {
        streetAddress,
        city,
        state,
        country,
      },
      isDefault: address.isDefault,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }

  private toCoordinateNumber(
    value: { toNumber?: () => number } | number | null | undefined,
  ): number | null {
    if (value == null) return null;
    return typeof value === 'number' ? value : Number(value);
  }

  private resolveAddressValues(
    dto: CreateAddressDto | UpdateAddressDto,
    existingAddress?: AddressRecord,
  ) {
    const existingComponents = this.extractAddressComponents(
      existingAddress?.addressComponents,
    );

    const streetAddress =
      dto.streetAddress ??
      dto.addressComponents?.streetAddress ??
      existingAddress?.streetAddress ??
      existingComponents?.streetAddress;

    const city =
      dto.city ??
      dto.addressComponents?.city ??
      existingAddress?.city ??
      existingComponents?.city;

    const state =
      dto.state ??
      dto.addressComponents?.state ??
      existingAddress?.state ??
      existingComponents?.state;

    const country =
      dto.country ??
      dto.addressComponents?.country ??
      existingAddress?.country ??
      existingComponents?.country ??
      'Nigeria';

    const fullAddress =
      dto.fullAddress ??
      existingAddress?.fullAddress ??
      this.joinAddressParts([streetAddress, city, state, country]);

    const shouldRebuildComponents =
      dto.addressComponents !== undefined ||
      dto.streetAddress !== undefined ||
      dto.city !== undefined ||
      dto.state !== undefined ||
      dto.country !== undefined ||
      !existingAddress;

    return {
      label: dto.label,
      fullAddress,
      streetAddress,
      city,
      state,
      country,
      placeId: dto.placeId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      addressComponents: shouldRebuildComponents
        ? this.normalizeAddressComponents({
          streetAddress,
          city,
          state,
          country,
        })
        : undefined,
    };
  }

  private normalizeAddressComponents(
    components?: AddressComponentsDto,
  ): Prisma.InputJsonValue | undefined {
    if (!components) {
      return undefined;
    }

    const normalized: Record<string, string> = {
      ...(components.streetAddress && {
        streetAddress: components.streetAddress,
      }),
      ...(components.city && { city: components.city }),
      ...(components.state && { state: components.state }),
      ...(components.country && { country: components.country }),
    };

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private extractAddressComponents(
    value: unknown,
  ): AddressComponentsDto | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const raw = value as Record<string, unknown>;
    return {
      ...(typeof raw.streetAddress === 'string' && {
        streetAddress: raw.streetAddress,
      }),
      ...(typeof raw.city === 'string' && { city: raw.city }),
      ...(typeof raw.state === 'string' && { state: raw.state }),
      ...(typeof raw.country === 'string' && { country: raw.country }),
    };
  }

  private joinAddressParts(parts: Array<string | null | undefined>) {
    return parts
      .map((part) => (typeof part === 'string' ? part.trim() : part))
      .filter((part): part is string => Boolean(part))
      .join(', ');
  }

  // ==================== ADMIN METHODS ====================

  async createAdminUser(dto: CreateAdminUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // Validate the assigned role exists and is active (lookup by id or name)
    const role = await (dto.adminRoleId
      ? this.prisma.adminRole.findUnique({ where: { id: dto.adminRoleId } })
      : this.prisma.adminRole.findFirst({
        where: { name: { equals: dto.role, mode: 'insensitive' } },
      }));
    if (!role) {
      throw new NotFoundException('The specified admin role does not exist');
    }
    if (!role.isActive) {
      throw new BadRequestException(`Admin role "${role.name}" is inactive`);
    }

    const hashedPassword = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        password: hashedPassword,
        role: UserRole.ADMIN,
        emailVerified: true,
        status: UserStatus.ACTIVE,
        adminRoleId: role.id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        emailVerified: true,
        adminRoleId: true,
        adminRole: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async assignAdminRole(userId: string, adminRoleId: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminRole: { select: { id: true, name: true } } },
    });
    if (!user) throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException(
        'Role assignment is only applicable to ADMIN users',
      );
    }

    const role = await this.prisma.adminRole.findUnique({
      where: { id: adminRoleId },
    });
    if (!role)
      throw new NotFoundException('The specified admin role does not exist');
    if (!role.isActive) {
      throw new BadRequestException(`Admin role "${role.name}" is inactive`);
    }

    const previousRole = user.adminRole;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { adminRoleId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        adminRoleId: true,
        adminRole: { select: { id: true, name: true } },
        updatedAt: true,
      },
    });
    void this.redis.del(`user:profile:${userId}`);

    await this.prisma.roleAuditLog.create({
      data: {
        action: 'USER_ROLE_ASSIGNED',
        adminRoleId,
        roleName: role.name,
        targetUserId: userId,
        actorId: actorId ?? null,
        before: previousRole ? { id: previousRole.id, name: previousRole.name } : Prisma.JsonNull,
        after: { id: role.id, name: role.name },
      },
    });

    return updated;
  }

  async deleteAdminUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException(
        'Only ADMIN users can be deleted via this endpoint',
      );
    }
    await this.prisma.user.delete({ where: { id: userId } });
    void this.redis.del(`user:profile:${userId}`);
  }

  async findAllUsers(queryDto: AdminQueryUsersDto) {
    const { search, status, role, page = 1, limit = 20 } = queryDto;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          ...ADMIN_USER_IDENTITY_SELECT,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          adminRole: {
            select: { name: true },
          },
          _count: {
            select: {
              bookings: true,
              addresses: true,
            },
          },
          wallet: {
            select: {
              balance: true,
              _count: { select: { transactions: true } },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => ({
        ...u,
        role: u.role === 'ADMIN' && u.adminRole ? u.adminRole.name : u.role,
        adminRole: undefined,
        walletBalance: Number(u.wallet?.balance ?? 0),
        transactionCount: u.wallet?._count.transactions ?? 0,
        wallet: undefined,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * The Users page (Website/App customers) — role is always hardcoded to
   * USER; this never surfaces staff/admin/beautician accounts. Mirrors
   * SalonBookingService.findAllCustomers's shape (lifecycle, value, visit/
   * spend stats, service filtering) but sourced from Booking + its JSON
   * `services` field, since customer-side bookings have no relational
   * service link the way SalonBooking does.
   */
  async findAllCustomerUsers(params: CustomerUsersFilterParams) {
    const {
      query, branchIds, dateFrom, dateTo, signupSource, serviceMode, accountStatus,
      lifecycle, value,
      minVisits, maxVisits, minSpend, maxSpend, minAvgSpend, maxAvgSpend,
      firstVisitFrom, firstVisitTo, lastVisitFrom, lastVisitTo,
      daysSinceLastVisitMin, daysSinceLastVisitMax,
      serviceCategoryIds, serviceIds,
      page = 1, limit = 20,
    } = params;

    const where: any = { role: UserRole.USER };
    if (query) {
      where.OR = [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
      ];
    }
    if (signupSource) where.signupSource = signupSource;
    if (accountStatus) where.status = accountStatus;

    if (branchIds?.length || dateFrom || dateTo || serviceMode) {
      where.bookings = {
        some: {
          ...(branchIds?.length && { branchId: { in: branchIds } }),
          ...(serviceMode && { bookingType: serviceMode }),
          ...((dateFrom || dateTo) && {
            bookingDate: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }),
        },
      };
    }

    const needsValueFilter = [
      minVisits, maxVisits, minSpend, maxSpend, minAvgSpend, maxAvgSpend,
      firstVisitFrom, firstVisitTo, lastVisitFrom, lastVisitTo,
      daysSinceLastVisitMin, daysSinceLastVisitMax,
      lifecycle, value, serviceCategoryIds?.length, serviceIds?.length,
    ].some((v) => v !== undefined);

    const [allMatching, dbTotal] = await Promise.all([
      this.prisma.user.findMany({
        where,
        ...(needsValueFilter ? {} : { skip: (page - 1) * limit, take: limit }),
        orderBy: { createdAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, signupSource: true, status: true, createdAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    const userIds = allMatching.map((u) => u.id);
    const bookings = userIds.length
      ? await this.prisma.booking.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true, status: true, totalAmount: true, bookingDate: true, services: true,
          branch: { select: { id: true, name: true } },
        },
      })
      : [];

    // Booking.services is a JSON array (no relational service link), so
    // category info has to be batch-resolved separately — not an `include`.
    const allServiceIds = new Set<string>();
    for (const b of bookings) {
      const lines = Array.isArray(b.services) ? (b.services as any[]) : [];
      for (const line of lines) if (line?.serviceId) allServiceIds.add(line.serviceId);
    }
    const serviceRecords = allServiceIds.size
      ? await this.prisma.service.findMany({
        where: { id: { in: Array.from(allServiceIds) } },
        select: { id: true, name: true, categoryId: true },
      })
      : [];
    const serviceById = new Map(serviceRecords.map((s) => [s.id, s]));

    const statsByUser = new Map<string, {
      visitCount: number; totalSpend: number; branches: Map<string, string>;
      firstVisitDate: Date | null; lastVisitDate: Date | null;
      serviceIds: Set<string>; serviceCategoryIds: Set<string>; serviceNames: Set<string>;
    }>();
    for (const b of bookings) {
      const s = statsByUser.get(b.userId) ?? {
        visitCount: 0, totalSpend: 0, branches: new Map(),
        firstVisitDate: null, lastVisitDate: null,
        serviceIds: new Set(), serviceCategoryIds: new Set(), serviceNames: new Set(),
      };
      if (b.branch) s.branches.set(b.branch.id, b.branch.name);
      if (b.status === 'COMPLETED') {
        s.visitCount += 1;
        s.totalSpend += Number(b.totalAmount);
        if (!s.firstVisitDate || b.bookingDate < s.firstVisitDate) s.firstVisitDate = b.bookingDate;
        if (!s.lastVisitDate || b.bookingDate > s.lastVisitDate) s.lastVisitDate = b.bookingDate;
        const lines = Array.isArray(b.services) ? (b.services as any[]) : [];
        for (const line of lines) {
          if (!line?.serviceId) continue;
          const svc = serviceById.get(line.serviceId);
          s.serviceIds.add(line.serviceId);
          s.serviceNames.add(svc?.name ?? line.name ?? 'Unknown service');
          if (svc?.categoryId) s.serviceCategoryIds.add(svc.categoryId);
        }
      }
      statsByUser.set(b.userId, s);
    }

    const now = new Date();
    const valueThresholds = await getCustomerValueThresholds(this.prisma);
    let withStats = allMatching.map((u) => {
      const s = statsByUser.get(u.id);
      const visitCount = s?.visitCount ?? 0;
      const totalSpend = s?.totalSpend ?? 0;
      const averageSpend = visitCount > 0 ? totalSpend / visitCount : 0;
      const daysSinceLastVisit = s?.lastVisitDate ? Math.floor((now.getTime() - s.lastVisitDate.getTime()) / 86400000) : null;

      return {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        name: [u.firstName, u.lastName].filter(Boolean).join(' '),
        email: u.email,
        phone: u.phone,
        signupSource: u.signupSource,
        status: u.status,
        role: 'USER',
        createdAt: u.createdAt,
        visitCount,
        totalSpend,
        averageSpend,
        branches: s ? Array.from(s.branches.values()) : [],
        firstVisitDate: s?.firstVisitDate ?? null,
        lastVisitDate: s?.lastVisitDate ?? null,
        daysSinceLastVisit,
        servicesPurchased: s ? Array.from(s.serviceNames) : [],
        serviceIds: s ? Array.from(s.serviceIds) : [],
        serviceCategoryIds: s ? Array.from(s.serviceCategoryIds) : [],
        lifecycle: classifyCustomerLifecycle({
          lastVisitDate: s?.lastVisitDate ?? null,
          completedVisitCount: visitCount,
          accountCreatedAt: u.createdAt,
          now,
        }),
        value: classifyCustomerValue(totalSpend, valueThresholds),
      };
    });

    if (minVisits !== undefined) withStats = withStats.filter((c) => c.visitCount >= minVisits);
    if (maxVisits !== undefined) withStats = withStats.filter((c) => c.visitCount <= maxVisits);
    if (minSpend !== undefined) withStats = withStats.filter((c) => c.totalSpend >= minSpend);
    if (maxSpend !== undefined) withStats = withStats.filter((c) => c.totalSpend <= maxSpend);
    if (minAvgSpend !== undefined) withStats = withStats.filter((c) => c.averageSpend >= minAvgSpend);
    if (maxAvgSpend !== undefined) withStats = withStats.filter((c) => c.averageSpend <= maxAvgSpend);
    if (firstVisitFrom) withStats = withStats.filter((c) => c.firstVisitDate && c.firstVisitDate >= new Date(firstVisitFrom));
    if (firstVisitTo) withStats = withStats.filter((c) => c.firstVisitDate && c.firstVisitDate <= new Date(firstVisitTo));
    if (lastVisitFrom) withStats = withStats.filter((c) => c.lastVisitDate && c.lastVisitDate >= new Date(lastVisitFrom));
    if (lastVisitTo) withStats = withStats.filter((c) => c.lastVisitDate && c.lastVisitDate <= new Date(lastVisitTo));
    if (daysSinceLastVisitMin !== undefined) withStats = withStats.filter((c) => c.daysSinceLastVisit !== null && c.daysSinceLastVisit >= daysSinceLastVisitMin);
    if (daysSinceLastVisitMax !== undefined) withStats = withStats.filter((c) => c.daysSinceLastVisit !== null && c.daysSinceLastVisit <= daysSinceLastVisitMax);
    if (lifecycle) withStats = withStats.filter((c) => c.lifecycle === lifecycle);
    if (value) withStats = withStats.filter((c) => c.value === value);
    if (serviceCategoryIds?.length) withStats = withStats.filter((c) => c.serviceCategoryIds.some((id) => serviceCategoryIds.includes(id)));
    if (serviceIds?.length) withStats = withStats.filter((c) => c.serviceIds.some((id) => serviceIds.includes(id)));

    const total = needsValueFilter ? withStats.length : dbTotal;
    const data = needsValueFilter ? withStats.slice((page - 1) * limit, (page - 1) * limit + limit) : withStats;

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** Performance cards for the Users page — computed over the same filtered set findAllCustomerUsers would return, so cards and table always agree. */
  async getCustomerUsersPerformance(params: Omit<CustomerUsersFilterParams, 'page' | 'limit'>) {
    const { data } = await this.findAllCustomerUsers({ ...params, page: 1, limit: Number.MAX_SAFE_INTEGER });

    const lifecycleCounts: Record<CustomerLifecycle, number> = { NEVER_VISITED: 0, NEW: 0, ACTIVE: 0, AT_RISK: 0, DORMANT: 0, INACTIVE: 0 };
    const valueCounts: Record<CustomerValue, number> = { STANDARD: 0, PREMIUM: 0, VIP: 0 };
    let totalSpend = 0;
    let totalVisits = 0;
    for (const c of data) {
      lifecycleCounts[c.lifecycle as CustomerLifecycle] += 1;
      valueCounts[c.value as CustomerValue] += 1;
      totalSpend += c.totalSpend;
      totalVisits += c.visitCount;
    }

    return {
      totalUsers: data.length,
      newUsers: lifecycleCounts.NEW,
      activeUsers: lifecycleCounts.ACTIVE,
      atRiskUsers: lifecycleCounts.AT_RISK,
      dormantUsers: lifecycleCounts.DORMANT,
      inactiveUsers: lifecycleCounts.INACTIVE,
      neverVisitedUsers: lifecycleCounts.NEVER_VISITED,
      standardValueUsers: valueCounts.STANDARD,
      premiumUsers: valueCounts.PREMIUM,
      vipUsers: valueCounts.VIP,
      totalSpend,
      averageSpend: data.length > 0 ? totalSpend / data.length : 0,
      totalVisits,
    };
  }

  /** Full profile/history for a single customer User — the drill-down view when an admin clicks a row on the Users page. */
  async getCustomerUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, signupSource: true, createdAt: true },
    });
    if (!user) throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);

    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      orderBy: { bookingDate: 'desc' },
      include: { branch: { select: { id: true, name: true } } },
    });

    const allServiceIds = new Set<string>();
    for (const b of bookings) {
      const lines = Array.isArray(b.services) ? (b.services as any[]) : [];
      for (const line of lines) if (line?.serviceId) allServiceIds.add(line.serviceId);
    }
    const serviceRecords = allServiceIds.size
      ? await this.prisma.service.findMany({
        where: { id: { in: Array.from(allServiceIds) } },
        select: { id: true, name: true, category: { select: { id: true, name: true } } },
      })
      : [];
    const serviceById = new Map(serviceRecords.map((s) => [s.id, s]));

    const completed = bookings.filter((b) => b.status === 'COMPLETED');
    const totalSpend = completed.reduce((sum, b) => sum + Number(b.totalAmount), 0);
    const visitCount = completed.length;
    const firstVisitDate = completed.length ? completed[completed.length - 1].bookingDate : null;
    const lastVisitDate = completed.length ? completed[0].bookingDate : null;
    const branchesVisited = Array.from(
      new Map(bookings.filter((b) => b.branch).map((b) => [b.branch!.id, b.branch!.name])).entries(),
    ).map(([id, name]) => ({ id, name }));

    const valueThresholds = await getCustomerValueThresholds(this.prisma);

    return {
      customer: user,
      firstVisitDate,
      lastVisitDate,
      visitCount,
      totalSpend,
      averageSpend: visitCount > 0 ? totalSpend / visitCount : 0,
      branchesVisited,
      lifecycle: classifyCustomerLifecycle({
        lastVisitDate,
        completedVisitCount: visitCount,
        accountCreatedAt: user.createdAt,
      }),
      value: classifyCustomerValue(totalSpend, valueThresholds),
      bookingHistory: bookings.map((b) => {
        const lines = Array.isArray(b.services) ? (b.services as any[]) : [];
        return {
          id: b.id,
          bookingDate: b.bookingDate,
          bookingTime: b.bookingTime,
          bookingType: b.bookingType,
          status: b.status,
          totalAmount: Number(b.totalAmount),
          branch: b.branch,
          services: lines.map((line) => {
            const svc = line?.serviceId ? serviceById.get(line.serviceId) : undefined;
            return { name: svc?.name ?? line?.name ?? 'Unknown service', category: svc?.category?.name ?? null, price: Number(line?.price ?? 0), quantity: line?.quantity ?? 1 };
          }),
        };
      }),
    };
  }

  async findUserDetailsAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...ADMIN_USER_IDENTITY_SELECT,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get wallet information + financial stats in parallel
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true, createdAt: true, updatedAt: true },
    });

    const walletStats = wallet
      ? await Promise.all([
        this.prisma.transaction.aggregate({
          where: {
            walletId: wallet.id,
            type: TransactionType.DEPOSIT,
            status: TransactionStatus.COMPLETED,
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.transaction.aggregate({
          where: {
            walletId: wallet.id,
            type: TransactionType.DEBIT,
            status: TransactionStatus.COMPLETED,
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.transaction.aggregate({
          where: {
            walletId: wallet.id,
            type: TransactionType.REFUND,
            status: TransactionStatus.COMPLETED,
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
      ])
      : null;

    // Get booking history
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      select: {
        id: true,
        bookingDate: true,
        bookingTime: true,
        status: true,
        totalAmount: true,
        paymentMethod: true,
        createdAt: true,
        services: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10, // Last 10 bookings
    });

    // Get active (non-deleted) addresses — same shape as user list
    const addresses = (await this.prisma.address.findMany({
      where: { userId, ...this.activeAddressWhere },
      select: {
        id: true,
        userId: true,
        label: true,
        fullAddress: true,
        streetAddress: true,
        city: true,
        state: true,
        country: true,
        placeId: true,
        addressComponents: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    })) as AddressRecord[];

    // Get wallet transactions (last 10 preview)
    const transactions = await this.prisma.transaction.findMany({
      where: { wallet: { userId } },
      select: {
        id: true,
        type: true,
        amount: true,
        status: true,
        description: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10, // Last 10 transactions
    });

    return {
      user,
      wallet: wallet
        ? {
          id: wallet.id,
          balance: Number(wallet.balance),
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt,
          totalDeposited: Number(walletStats![0]._sum.amount || 0),
          totalDeposits: walletStats![0]._count.id,
          totalDebited: Number(walletStats![1]._sum.amount || 0),
          totalDebits: walletStats![1]._count.id,
          totalRefunded: Number(walletStats![2]._sum.amount || 0),
          totalRefunds: walletStats![2]._count.id,
        }
        : null,
      bookings: bookings.map((booking) => ({
        ...booking,
        totalAmount: Number(booking.totalAmount),
      })),
      addresses: addresses.map((address) => this.formatAddress(address)),
      transactions: transactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
      })),
      stats: {
        totalBookings: bookings.length,
        totalAddresses: addresses.length,
        walletBalance: wallet ? Number(wallet.balance) : 0,
      },
    };
  }

  async adminGetUserTransactions(userId: string, query: GetTransactionsDto) {
    const { page = 1, limit = 20, type, status } = query;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found for this user');

    const where: any = { walletId: wallet.id };
    if (type) where.type = type;
    if (status) where.status = status;

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((t) => {
        const { metadata, ...safeTransaction } = t;
        return {
          ...safeTransaction,
          amount: Number(safeTransaction.amount),
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateUserStatus(userId: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    void Promise.all([
      this.redis.del(`user:profile:${userId}`),
      this.redis.del('analytics:users'),
      this.redis.del('analytics:dashboard'),
    ]);

    return updatedUser;
  }

  async searchByEmail(email: string) {
    const users = await this.prisma.user.findMany({
      where: { email: { contains: email.trim(), mode: 'insensitive' } },
      select: {
        ...ADMIN_USER_IDENTITY_SELECT,
        role: true,
        status: true,
        createdAt: true,
        influencer: {
          select: { id: true, isActive: true },
        },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    return users;
  }
}