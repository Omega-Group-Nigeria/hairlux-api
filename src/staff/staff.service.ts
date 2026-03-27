import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto';
import { AddEmploymentHistoryDto } from './dto/add-employment-history.dto';
import { UpdateEmploymentHistoryDto } from './dto/update-employment-history.dto';
import { QueryUpcomingBirthdaysDto } from './dto/query-upcoming-birthdays.dto';
import { CreateStaffLocationDto } from './dto/create-staff-location.dto';
import { QueryStaffLocationsDto } from './dto/query-staff-locations.dto';
import { UpdateStaffLocationDto } from './dto/update-staff-location.dto';

const TTL = 300;

const STAFF_EMPLOYMENT_STATUS = {
  ACTIVE: 'ACTIVE',
  ON_LEAVE: 'ON_LEAVE',
  SUSPENDED: 'SUSPENDED',
  EXITED: 'EXITED',
  ARCHIVED: 'ARCHIVED',
} as const;

const STAFF_EMPLOYMENT_TYPE = {
  FULL_TIME: 'FULL_TIME',
} as const;

type StaffEmploymentStatusValue =
  (typeof STAFF_EMPLOYMENT_STATUS)[keyof typeof STAFF_EMPLOYMENT_STATUS];

type StaffRecord = {
  id: string;
  name: string;
  staffCode: string;
  currentRole: string;
  locationId: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  employmentStatus: StaffEmploymentStatusValue;
  reasonForExit: string | null;
  exitDate: Date | null;
  archivedAt: Date | null;
  birthdayLastEmailedYear: number | null;
  createdAt: Date;
  updatedAt: Date;
  location?: StaffLocationRecord;
};

type StaffEmploymentHistoryRecord = {
  id: string;
  staffId: string;
  roleTitle: string;
  locationId: string;
  employmentType: string;
  startDate: Date;
  endDate: Date | null;
  reasonForChange: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  location?: StaffLocationRecord;
};

type StaffLocationRecord = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type StaffWithHistories = StaffRecord & {
  histories: StaffEmploymentHistoryRecord[];
};

type QueryArgs = Record<string, unknown>;

interface StaffModelDelegate {
  findFirst(args: QueryArgs): Promise<StaffRecord | null>;
  findMany(args: QueryArgs): Promise<StaffRecord[]>;
  findUnique(args: QueryArgs): Promise<StaffWithHistories | null>;
  create(args: QueryArgs): Promise<StaffRecord>;
  update(args: QueryArgs): Promise<StaffRecord>;
  updateMany(args: QueryArgs): Promise<{ count: number }>;
  count(args?: QueryArgs): Promise<number>;
}

interface StaffHistoryModelDelegate {
  findFirst(args: QueryArgs): Promise<StaffEmploymentHistoryRecord | null>;
  create(args: QueryArgs): Promise<StaffEmploymentHistoryRecord>;
  update(args: QueryArgs): Promise<StaffEmploymentHistoryRecord>;
  delete(args: QueryArgs): Promise<StaffEmploymentHistoryRecord>;
}

interface StaffLocationModelDelegate {
  findFirst(args: QueryArgs): Promise<StaffLocationRecord | null>;
  findUnique(args: QueryArgs): Promise<StaffLocationRecord | null>;
  findMany(args: QueryArgs): Promise<StaffLocationRecord[]>;
  create(args: QueryArgs): Promise<StaffLocationRecord>;
  update(args: QueryArgs): Promise<StaffLocationRecord>;
  delete(args: QueryArgs): Promise<StaffLocationRecord>;
}

type StaffTransactionClient = {
  staff: StaffModelDelegate;
  staffEmploymentHistory: StaffHistoryModelDelegate;
  staffLocation: StaffLocationModelDelegate;
};

@Injectable()
export class StaffService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StaffService.name);
  private birthdayInterval: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private mailService: MailService,
  ) {}

  private get staffModel(): StaffModelDelegate {
    return (this.prisma as unknown as { staff: StaffModelDelegate }).staff;
  }

  private get staffHistoryModel(): StaffHistoryModelDelegate {
    return (
      this.prisma as unknown as {
        staffEmploymentHistory: StaffHistoryModelDelegate;
      }
    ).staffEmploymentHistory;
  }

  private get staffLocationModel(): StaffLocationModelDelegate {
    return (this.prisma as unknown as { staffLocation: StaffLocationModelDelegate })
      .staffLocation;
  }

  onModuleInit() {
    // Run once shortly after boot, then every hour.
    setTimeout(() => {
      void this.sendBirthdayEmailsForToday();
    }, 15000);

    this.birthdayInterval = setInterval(
      () => void this.sendBirthdayEmailsForToday(),
      60 * 60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.birthdayInterval) {
      clearInterval(this.birthdayInterval);
      this.birthdayInterval = null;
    }
  }

  private async invalidateCache(staffId?: string) {
    await Promise.all([
      this.redis.delByPattern('staff:list:*'),
      this.redis.delByPattern('staff:birthdays:*'),
      ...(staffId ? [this.redis.del(`staff:one:${staffId}`)] : []),
    ]);
  }

  private assertEndDateAfterStart(startDate: Date, endDate?: Date) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }
  }

  private normalizeNullableString(value?: string | null): string | null {
    if (value === undefined) return null;
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async generateStaffCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = Math.floor(Math.random() * 1_000_000)
        .toString()
        .padStart(6, '0');
      const code = `STF-${suffix}`;

      const existing = await this.staffModel.findFirst({
        where: { staffCode: code },
        select: { id: true },
      });

      if (!existing) {
        return code;
      }
    }

    throw new ConflictException(
      'Could not generate a unique staff code. Please try again.',
    );
  }

  private async assertLocationExists(locationId: string, requireActive = false) {
    const location = await this.staffLocationModel.findUnique({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException('Staff location not found');
    }

    if (requireActive && !location.isActive) {
      throw new BadRequestException('Selected staff location is inactive');
    }

    return location;
  }

  private getNextBirthday(dateOfBirth: Date, fromDate: Date) {
    const year = fromDate.getFullYear();
    const month = dateOfBirth.getMonth();
    const day = dateOfBirth.getDate();

    let next = new Date(year, month, day, 0, 0, 0, 0);
    if (
      next <
      new Date(
        fromDate.getFullYear(),
        fromDate.getMonth(),
        fromDate.getDate(),
        0,
        0,
        0,
        0,
      )
    ) {
      next = new Date(year + 1, month, day, 0, 0, 0, 0);
    }

    const daysUntil = Math.ceil(
      (next.getTime() -
        new Date(
          fromDate.getFullYear(),
          fromDate.getMonth(),
          fromDate.getDate(),
          0,
          0,
          0,
          0,
        ).getTime()) /
        (1000 * 60 * 60 * 24),
    );

    return { nextBirthday: next, daysUntil };
  }

  async createLocation(dto: CreateStaffLocationDto) {
    const existing = await this.staffLocationModel.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Staff location with this name already exists');
    }

    const location = await this.staffLocationModel.create({
      data: {
        name: dto.name,
      },
    });

    await this.redis.delByPattern('staff:locations:*');
    return location;
  }

  async findAllLocations(queryDto: QueryStaffLocationsDto) {
    const cacheKey = `staff:locations:${JSON.stringify(queryDto)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const { search, includeInactive = false } = queryDto;
    const where: Record<string, unknown> = {
      ...(includeInactive ? {} : { isActive: true }),
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const locations = await this.staffLocationModel.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    await this.redis.set(cacheKey, locations, TTL);
    return locations;
  }

  async findLocation(id: string) {
    return this.assertLocationExists(id);
  }

  async updateLocation(id: string, dto: UpdateStaffLocationDto) {
    await this.assertLocationExists(id);

    if (dto.name) {
      const duplicate = await this.staffLocationModel.findFirst({
        where: {
          id: { not: id },
          name: { equals: dto.name, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException('Staff location with this name already exists');
      }
    }

    if (dto.isActive === false) {
      const activeStaffCount = await this.staffModel.count({
        where: {
          locationId: id,
          employmentStatus: {
            in: [
              STAFF_EMPLOYMENT_STATUS.ACTIVE,
              STAFF_EMPLOYMENT_STATUS.ON_LEAVE,
              STAFF_EMPLOYMENT_STATUS.SUSPENDED,
            ],
          },
        },
      });

      if (activeStaffCount > 0) {
        throw new ConflictException(
          'Cannot deactivate location with active staff assigned',
        );
      }
    }

    const updated = await this.staffLocationModel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await Promise.all([
      this.redis.delByPattern('staff:locations:*'),
      this.redis.delByPattern('staff:list:*'),
      this.redis.delByPattern('staff:one:*'),
      this.redis.delByPattern('staff:birthdays:*'),
    ]);

    return updated;
  }

  async deleteLocation(id: string) {
    await this.assertLocationExists(id);

    const usageCount = await this.staffModel.count({ where: { locationId: id } });
    if (usageCount > 0) {
      throw new ConflictException(
        'Cannot delete location because it is referenced by staff records',
      );
    }

    await this.staffLocationModel.delete({ where: { id } });
    await this.redis.delByPattern('staff:locations:*');
  }

  async create(dto: CreateStaffDto) {
    const duplicate = dto.email
      ? await this.staffModel.findFirst({
          where: { email: dto.email.toLowerCase() },
          select: { id: true },
        })
      : null;

    if (duplicate) {
      throw new ConflictException(
        'Email is already used by another staff record',
      );
    }

    const staffCode = await this.generateStaffCode();
    await this.assertLocationExists(dto.locationId, true);

    const startDate = dto.employmentStartDate
      ? new Date(dto.employmentStartDate)
      : new Date();

    const staff = await this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as StaffTransactionClient;

      const created = await txClient.staff.create({
        data: {
          name: dto.name,
          staffCode,
          currentRole: dto.currentRole,
          locationId: dto.locationId,
          email: dto.email?.toLowerCase(),
          phone: this.normalizeNullableString(dto.phone),
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          employmentStatus:
            dto.employmentStatus ?? STAFF_EMPLOYMENT_STATUS.ACTIVE,
        },
      });

      await txClient.staffEmploymentHistory.create({
        data: {
          staffId: created.id,
          roleTitle: dto.currentRole,
          locationId: dto.locationId,
          employmentType: dto.employmentType ?? STAFF_EMPLOYMENT_TYPE.FULL_TIME,
          startDate,
          reasonForChange: 'Initial assignment',
          notes: this.normalizeNullableString(dto.employmentNotes),
        },
      });

      return created;
    });

    await this.invalidateCache(staff.id);
    return this.findOne(staff.id);
  }

  async findAll(queryDto: QueryStaffDto) {
    const cacheKey = `staff:list:${JSON.stringify(queryDto)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const {
      page = 1,
      limit = 20,
      search,
      employmentStatus,
      locationId,
      currentRole,
      includeArchived = false,
    } = queryDto;

    const where: Record<string, unknown> = {};

    if (employmentStatus) {
      where.employmentStatus = employmentStatus;
    } else if (!includeArchived) {
      where.employmentStatus = { not: STAFF_EMPLOYMENT_STATUS.ARCHIVED };
    }

    if (locationId) {
      where.locationId = locationId;
    }

    if (currentRole) {
      where.currentRole = {
        contains: currentRole,
        mode: 'insensitive',
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { staffCode: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { currentRole: { contains: search, mode: 'insensitive' } },
        { location: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const skip = (page - 1) * limit;

    const [staff, total] = await Promise.all([
      this.staffModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          location: true,
        },
      }),
      this.staffModel.count({ where }),
    ]);

    const result = {
      data: staff,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.redis.set(cacheKey, result, TTL);
    return result;
  }

  async findOne(id: string) {
    const cacheKey = `staff:one:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const staff = await this.staffModel.findUnique({
      where: { id },
      include: {
        location: true,
        histories: {
          orderBy: { startDate: 'desc' },
          include: {
            location: true,
          },
        },
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }

    await this.redis.set(cacheKey, staff, TTL);
    return staff;
  }

  async update(id: string, dto: UpdateStaffDto) {
    await this.findOne(id);

    if (dto.locationId) {
      await this.assertLocationExists(dto.locationId, true);
    }

    if (dto.email) {
      const duplicateEmail = await this.staffModel.findFirst({
        where: {
          id: { not: id },
          email: dto.email.toLowerCase(),
        },
        select: { id: true },
      });

      if (duplicateEmail) {
        throw new ConflictException(
          'Email is already used by another staff record',
        );
      }
    }

    const updated = await this.staffModel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.currentRole !== undefined && { currentRole: dto.currentRole }),
        ...(dto.locationId !== undefined && {
          locationId: dto.locationId,
        }),
        ...(dto.email !== undefined && {
          email: dto.email ? dto.email.toLowerCase() : null,
        }),
        ...(dto.phone !== undefined && {
          phone: this.normalizeNullableString(dto.phone),
        }),
        ...(dto.dateOfBirth !== undefined && {
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        }),
        ...(dto.employmentStatus !== undefined && {
          employmentStatus: dto.employmentStatus,
        }),
        ...(dto.reasonForExit !== undefined && {
          reasonForExit: this.normalizeNullableString(dto.reasonForExit),
        }),
        ...(dto.exitDate !== undefined && {
          exitDate: dto.exitDate ? new Date(dto.exitDate) : null,
        }),
      },
    });

    await this.invalidateCache(updated.id);
    return this.findOne(updated.id);
  }

  async updateStatus(id: string, dto: UpdateStaffStatusDto) {
    await this.findOne(id);
    const now = new Date();
    const exitDate = dto.exitDate ? new Date(dto.exitDate) : now;

    const status = dto.status as StaffEmploymentStatusValue;

    const result = await this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as StaffTransactionClient;

      if (
        status === STAFF_EMPLOYMENT_STATUS.EXITED ||
        status === STAFF_EMPLOYMENT_STATUS.ARCHIVED
      ) {
        const openHistory = await txClient.staffEmploymentHistory.findFirst({
          where: { staffId: id, endDate: null },
          orderBy: { startDate: 'desc' },
        });

        if (openHistory) {
          await txClient.staffEmploymentHistory.update({
            where: { id: openHistory.id },
            data: { endDate: exitDate },
          });
        }
      }

      return txClient.staff.update({
        where: { id },
        data: {
          employmentStatus: status,
          reasonForExit:
            status === STAFF_EMPLOYMENT_STATUS.EXITED ||
            status === STAFF_EMPLOYMENT_STATUS.ARCHIVED
              ? this.normalizeNullableString(dto.reasonForExit)
              : null,
          exitDate:
            status === STAFF_EMPLOYMENT_STATUS.EXITED ||
            status === STAFF_EMPLOYMENT_STATUS.ARCHIVED
              ? exitDate
              : null,
          archivedAt:
            status === STAFF_EMPLOYMENT_STATUS.ARCHIVED ? now : null,
        },
      });
    });

    await this.invalidateCache(result.id);
    return this.findOne(result.id);
  }

  async archive(id: string, reasonForExit?: string, exitDate?: string) {
    return this.updateStatus(id, {
      status: STAFF_EMPLOYMENT_STATUS.ARCHIVED,
      reasonForExit,
      exitDate,
    });
  }

  async restore(id: string) {
    await this.findOne(id);

    const restored = await this.staffModel.update({
      where: { id },
      data: {
        employmentStatus: STAFF_EMPLOYMENT_STATUS.ACTIVE,
        reasonForExit: null,
        exitDate: null,
        archivedAt: null,
      },
    });

    await this.invalidateCache(restored.id);
    return this.findOne(restored.id);
  }

  async addEmploymentHistory(id: string, dto: AddEmploymentHistoryDto) {
    await this.findOne(id);
    await this.assertLocationExists(dto.locationId, true);

    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;
    this.assertEndDateAfterStart(startDate, endDate);

    const result = await this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as StaffTransactionClient;

      const openHistory = await txClient.staffEmploymentHistory.findFirst({
        where: { staffId: id, endDate: null },
        orderBy: { startDate: 'desc' },
      });

      if (openHistory && startDate <= openHistory.startDate) {
        throw new BadRequestException(
          'New history startDate must be after the current open history startDate',
        );
      }

      if (openHistory) {
        await txClient.staffEmploymentHistory.update({
          where: { id: openHistory.id },
          data: { endDate: startDate },
        });
      }

      const history = await txClient.staffEmploymentHistory.create({
        data: {
          staffId: id,
          roleTitle: dto.roleTitle,
          locationId: dto.locationId,
          employmentType: dto.employmentType,
          startDate,
          endDate,
          reasonForChange: this.normalizeNullableString(dto.reasonForChange),
          notes: this.normalizeNullableString(dto.notes),
        },
      });

      await txClient.staff.update({
        where: { id },
        data: {
          currentRole: dto.roleTitle,
          locationId: dto.locationId,
          ...(dto.endDate
            ? { employmentStatus: STAFF_EMPLOYMENT_STATUS.ACTIVE }
            : {}),
        },
      });

      return history;
    });

    await this.invalidateCache(id);
    return result;
  }

  async updateEmploymentHistory(
    id: string,
    historyId: string,
    dto: UpdateEmploymentHistoryDto,
  ) {
    await this.findOne(id);

    if (dto.locationId) {
      await this.assertLocationExists(dto.locationId, true);
    }

    const history = await this.staffHistoryModel.findFirst({
      where: { id: historyId, staffId: id },
    });

    if (!history) {
      throw new NotFoundException('Employment history record not found');
    }

    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : history.startDate;
    const endDate = dto.endDate
      ? new Date(dto.endDate)
      : (history.endDate ?? undefined);

    this.assertEndDateAfterStart(startDate, endDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as StaffTransactionClient;

      const record = await txClient.staffEmploymentHistory.update({
        where: { id: historyId },
        data: {
          ...(dto.roleTitle !== undefined && { roleTitle: dto.roleTitle }),
          ...(dto.locationId !== undefined && {
            locationId: dto.locationId,
          }),
          ...(dto.employmentType !== undefined && {
            employmentType: dto.employmentType,
          }),
          ...(dto.startDate !== undefined && { startDate }),
          ...(dto.endDate !== undefined && {
            endDate: dto.endDate ? endDate : null,
          }),
          ...(dto.reasonForChange !== undefined && {
            reasonForChange: this.normalizeNullableString(dto.reasonForChange),
          }),
          ...(dto.notes !== undefined && {
            notes: this.normalizeNullableString(dto.notes),
          }),
        },
      });

      if (!record.endDate) {
        await txClient.staff.update({
          where: { id },
          data: {
            ...(dto.roleTitle !== undefined && { currentRole: dto.roleTitle }),
            ...(dto.locationId !== undefined && {
              locationId: dto.locationId,
            }),
          },
        });
      }

      return record;
    });

    await this.invalidateCache(id);
    return updated;
  }

  async removeEmploymentHistory(id: string, historyId: string) {
    await this.findOne(id);

    const history = await this.staffHistoryModel.findFirst({
      where: { id: historyId, staffId: id },
    });

    if (!history) {
      throw new NotFoundException('Employment history record not found');
    }

    if (!history.endDate) {
      throw new BadRequestException(
        'Cannot delete the current active employment history record',
      );
    }

    await this.staffHistoryModel.delete({ where: { id: historyId } });
    await this.invalidateCache(id);
  }

  async getUpcomingBirthdays(queryDto: QueryUpcomingBirthdaysDto) {
    const cacheKey = `staff:birthdays:${JSON.stringify(queryDto)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const { daysAhead = 30, includeFormer = false } = queryDto;

    const staff = await this.staffModel.findMany({
      where: {
        dateOfBirth: { not: null },
        ...(includeFormer
          ? {}
          : {
              employmentStatus: {
                in: [
                  STAFF_EMPLOYMENT_STATUS.ACTIVE,
                  STAFF_EMPLOYMENT_STATUS.ON_LEAVE,
                  STAFF_EMPLOYMENT_STATUS.SUSPENDED,
                ],
              },
            }),
      },
      select: {
        id: true,
        name: true,
        staffCode: true,
        email: true,
        currentRole: true,
        employmentStatus: true,
        dateOfBirth: true,
        location: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const today = new Date();

    const upcoming = staff
      .map((s: StaffRecord) => {
        const dateOfBirth = s.dateOfBirth as Date;
        const { nextBirthday, daysUntil } = this.getNextBirthday(
          dateOfBirth,
          today,
        );
        return {
          ...s,
          nextBirthday,
          daysUntil,
        };
      })
      .filter((s) => s.daysUntil <= daysAhead)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    await this.redis.set(cacheKey, upcoming, TTL);
    return upcoming;
  }

  async sendBirthdayEmailsForToday() {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const month = now.getMonth();
      const day = now.getDate();

      const candidates = await this.staffModel.findMany({
        where: {
          employmentStatus: STAFF_EMPLOYMENT_STATUS.ACTIVE,
          dateOfBirth: { not: null },
          email: { not: null },
        },
        select: {
          id: true,
          name: true,
          email: true,
          dateOfBirth: true,
          birthdayLastEmailedYear: true,
        },
      });

      const birthdayToday = candidates.filter((staff: StaffRecord) => {
        const dob = staff.dateOfBirth as Date;
        return dob.getMonth() === month && dob.getDate() === day;
      });

      for (const staff of birthdayToday) {
        const updated = await this.staffModel.updateMany({
          where: {
            id: staff.id,
            employmentStatus: STAFF_EMPLOYMENT_STATUS.ACTIVE,
            OR: [
              { birthdayLastEmailedYear: null },
              { birthdayLastEmailedYear: { not: currentYear } },
            ],
          },
          data: { birthdayLastEmailedYear: currentYear },
        });

        if (updated.count > 0 && staff.email) {
          const firstName = staff.name.split(' ')[0] || staff.name;
          const email = staff.email;
          await this.mailService.sendStaffBirthdayEmail(email, firstName);
          this.logger.log(`Birthday email queued for staff ${staff.id}`);
        }
      }

      if (birthdayToday.length > 0) {
        await this.invalidateCache();
      }
    } catch (error) {
      this.logger.error(
        `Failed to process birthday emails: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
