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
import { AdminQueryUsersDto } from './dto/admin-query-users.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import {
  UserRole,
  UserStatus,
  TransactionType,
  TransactionStatus,
} from '@prisma/client';
import { GetTransactionsDto } from '../wallet/dto/get-transactions.dto';
import { ErrorMessages } from '../common/constants/error-messages';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

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

  // Address Management
  async getAddresses(userId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses;
  }

  async createAddress(userId: string, createAddressDto: CreateAddressDto) {
    const { isDefault, ...addressData } = createAddressDto;

    // If this is set as default, unset other default addresses
    if (isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await this.prisma.address.create({
      data: {
        ...addressData,
        userId,
        isDefault: isDefault || false,
        country: addressData.country || 'Nigeria',
      },
    });

    return address;
  }

  async updateAddress(
    userId: string,
    addressId: string,
    updateAddressDto: UpdateAddressDto,
  ) {
    // Check if address exists and belongs to user
    const existingAddress = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!existingAddress) {
      throw new NotFoundException(ErrorMessages.ADDRESS_NOT_FOUND);
    }

    const { isDefault, ...addressData } = updateAddressDto;

    // If this is set as default, unset other default addresses
    if (isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    const address = await this.prisma.address.update({
      where: { id: addressId },
      data: {
        ...addressData,
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    return address;
  }

  async deleteAddress(userId: string, addressId: string) {
    // Check if address exists and belongs to user
    const existingAddress = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!existingAddress) {
      throw new NotFoundException(ErrorMessages.ADDRESS_NOT_FOUND);
    }

    // Check if address is used in any bookings
    const bookingsCount = await this.prisma.booking.count({
      where: { addressId },
    });

    if (bookingsCount > 0) {
      throw new BadRequestException(
        'Cannot delete address that is used in bookings',
      );
    }

    await this.prisma.address.delete({
      where: { id: addressId },
    });

    return { message: 'Address deleted successfully' };
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

  async assignAdminRole(userId: string, adminRoleId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
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
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
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

  async findUserDetailsAdmin(userId: string) {
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

    // Get addresses
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      select: {
        id: true,
        label: true,
        addressLine: true,
        city: true,
        state: true,
        country: true,
        isDefault: true,
        createdAt: true,
      },
    });

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
      addresses,
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
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
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
}
