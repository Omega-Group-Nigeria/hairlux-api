import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';
import { AuthService } from 'src/auth/auth.service';
import { HAIRLUX_LOGO_BASE64 } from '../common/assets/hairlux-logo';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { S3Service } from '../storage/s3.service';
import { AddEmploymentHistoryDto } from './dto/add-employment-history.dto';
import { CreateStaffLocationDto } from './dto/create-staff-location.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { QueryStaffLocationsDto } from './dto/query-staff-locations.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { QueryUpcomingBirthdaysDto } from './dto/query-upcoming-birthdays.dto';
import {
  SubmitAddressDto,
  SubmitEmergencyContactDto,
  SubmitGuarantorDto,
  SubmitReferenceDto,
} from './dto/submit-onboarding-info.dto';
import { TransferBranchDto } from './dto/transfer-branch.dto';
import { UpdateEmploymentHistoryDto } from './dto/update-employment-history.dto';
import { UpdateOnboardingItemDto } from './dto/update-onboarding-item.dto';
import { UpdateStaffLocationDto } from './dto/update-staff-location.dto';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

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

// Applied to every new hire uniformly rather than a per-role config map --
// simpler, and an admin can mark an inapplicable item complete manually
// (e.g. "N/A for this role") rather than the system silently deciding what
// applies. Revisit if role-specific checklists become a real need.
const ONBOARDING_ITEM_TYPES = [
  'GUARANTOR_VERIFICATION',
  'EMERGENCY_CONTACT',
  'REFERENCE_CHECK',
  'ADDRESS_VERIFICATION',
  'PASSPORT_PHOTO',
  'POLICY_ACKNOWLEDGMENT',
] as const;

// Dev Feedback Round 4, item #12 fix: ONBOARDING_ITEM_TYPES above is
// deliberately the SEEDING set only (the six items created automatically
// for every new hire) -- PHYSICAL_ADDRESS_VERIFICATION is intentionally
// excluded from it, since that item is selective and admin-triggered
// per staff member, never auto-seeded. But a row's `type` column can
// still genuinely hold PHYSICAL_ADDRESS_VERIFICATION once one has been
// requested, so the general "what can a fetched row's type be" type
// needs to be wider than the seeding array -- narrowing it to
// ONBOARDING_ITEM_TYPES alone was a latent bug (types that don't
// actually overlap with what the column allows), just never
// surfaced until code compared a fetched row's type against that literal.
type OnboardingItemTypeValue = (typeof ONBOARDING_ITEM_TYPES)[number] | 'PHYSICAL_ADDRESS_VERIFICATION';

type OnboardingItemRecord = {
  id: string;
  staffId: string;
  type: OnboardingItemTypeValue;
  isComplete: boolean;
  reviewStatus: 'NOT_STARTED' | 'SUBMITTED' | 'COMPLETE';
  submittedAt: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
  notes: string | null;
  createdAt: Date;
};

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
  code: string;
  staffSequence: number;
  address: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type StaffWithHistories = StaffRecord & {
  histories: StaffEmploymentHistoryRecord[];
};

type DisciplinaryActionRecord = {
  id: string;
  staffId: string;
  actorId: string | null;
  type: string;
  reason: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
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

interface DisciplinaryActionModelDelegate {
  create(args: QueryArgs): Promise<DisciplinaryActionRecord>;
  findMany(args: QueryArgs): Promise<DisciplinaryActionRecord[]>;
}

type StaffCodeHistoryRecord = {
  id: string;
  staffId: string;
  code: string;
  branchId: string;
  activeFrom: Date;
  activeUntil: Date | null;
  reason: string | null;
  createdAt: Date;
};

interface StaffCodeHistoryModelDelegate {
  create(args: QueryArgs): Promise<StaffCodeHistoryRecord>;
  update(args: QueryArgs): Promise<StaffCodeHistoryRecord>;
  findFirst(args: QueryArgs): Promise<StaffCodeHistoryRecord | null>;
  findMany(args: QueryArgs): Promise<StaffCodeHistoryRecord[]>;
}

interface StaffLocationModelDelegate {
  findFirst(args: QueryArgs): Promise<StaffLocationRecord | null>;
  findUnique(args: QueryArgs): Promise<StaffLocationRecord | null>;
  findMany(args: QueryArgs): Promise<StaffLocationRecord[]>;
  create(args: QueryArgs): Promise<StaffLocationRecord>;
  update(args: QueryArgs): Promise<StaffLocationRecord>;
  delete(args: QueryArgs): Promise<StaffLocationRecord>;
}

interface OnboardingItemModelDelegate {
  findMany(args: QueryArgs): Promise<OnboardingItemRecord[]>;
  findFirst(args: QueryArgs): Promise<OnboardingItemRecord | null>;
  create(args: QueryArgs): Promise<OnboardingItemRecord>;
  createMany(args: QueryArgs): Promise<{ count: number }>;
  update(args: QueryArgs): Promise<OnboardingItemRecord>;
  count(args?: QueryArgs): Promise<number>;
}

type StaffTransactionClient = {
  staff: StaffModelDelegate;
  staffEmploymentHistory: StaffHistoryModelDelegate;
  staffLocation: StaffLocationModelDelegate;
  staffOnboardingItem: OnboardingItemModelDelegate;
  disciplinaryAction: DisciplinaryActionModelDelegate;
  staffCodeHistory: StaffCodeHistoryModelDelegate;
};

@Injectable()
export class StaffService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StaffService.name);
  private birthdayTimeout: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private mailService: MailService,
    private authService: AuthService,
    private s3Service: S3Service,
    private configService: ConfigService,
  ) { }

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

  private get disciplinaryActionModel(): DisciplinaryActionModelDelegate {
    return (
      this.prisma as unknown as {
        disciplinaryAction: DisciplinaryActionModelDelegate;
      }
    ).disciplinaryAction;
  }

  private get staffLocationModel(): StaffLocationModelDelegate {
    return (
      this.prisma as unknown as { staffLocation: StaffLocationModelDelegate }
    ).staffLocation;
  }

  private get onboardingItemModel(): OnboardingItemModelDelegate {
    return (
      this.prisma as unknown as { staffOnboardingItem: OnboardingItemModelDelegate }
    ).staffOnboardingItem;
  }

  private scheduleNextBirthdayRun(fromDate = new Date()) {
    if (this.birthdayTimeout) {
      clearTimeout(this.birthdayTimeout);
      this.birthdayTimeout = null;
    }

    const nextRun = new Date(fromDate);
    nextRun.setHours(0, 1, 0, 0); // 00:01 local server time
    if (nextRun <= fromDate) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delay = Math.max(0, nextRun.getTime() - fromDate.getTime());

    this.logger.log(
      `Next birthday email check scheduled for ${nextRun.toISOString()}`,
    );

    this.birthdayTimeout = setTimeout(() => {
      void this.sendBirthdayEmailsForToday().finally(() => {
        this.scheduleNextBirthdayRun();
      });
    }, delay);
  }

  onModuleInit() {
    // Run once shortly after boot, then once daily at 00:01 server time.
    setTimeout(() => {
      void this.sendBirthdayEmailsForToday();
    }, 15000);

    this.scheduleNextBirthdayRun();
  }

  onModuleDestroy() {
    if (this.birthdayTimeout) {
      clearTimeout(this.birthdayTimeout);
      this.birthdayTimeout = null;
    }
  }


  async invalidateCache(staffId?: string) {
    await Promise.all([
      this.redis.delByPattern('staff:list:*'),
      this.redis.delByPattern('staff:birthdays:*'),
      this.redis.delByPattern('staff:byUser:*'),
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

  /**
   * Generates a branch-coded staff code, e.g. HL-IFE-0001.
   *
   * MUST be called with the transaction client that will also perform the
   * `staff.create()` call, so the sequence increment and the staff record
   * creation commit or roll back together. The atomic `increment` avoids
   * the race condition the old random-retry approach was designed around —
   * two simultaneous hires at the same branch cannot receive the same
   * sequence number because Postgres serializes the row-level UPDATE.
   */
  private async generateStaffCode(
    locationId: string,
    txClient: StaffTransactionClient,
  ): Promise<string> {
    const location = (await txClient.staffLocation.update({
      where: { id: locationId },
      data: { staffSequence: { increment: 1 } },
      select: { code: true, staffSequence: true },
    })) as unknown as { code: string; staffSequence: number };

    return `HL-${location.code}-${location.staffSequence.toString().padStart(4, '0')}`;
  }

  // Words stripped when auto-suggesting a branch code from its name — state
  // names and generic descriptors repeat across branches and produce
  // meaningless or colliding codes if used as the basis for the code.
  private static readonly CODE_STOPWORDS = new Set([
    'OYO', 'OSUN', 'LAGOS', 'ABUJA', 'OGUN', 'ONDO', 'EKITI', 'KWARA',
    'ACADEMY', 'PLAZA', 'MARKET', 'JUNCTION', 'ROAD', 'STREET', 'RD', 'ST',
    'BRANCH', 'HAIRLUX',
  ]);

  /**
   * Suggests a 2-3 letter branch code from a branch name. This is a
   * SUGGESTION ONLY — surfaced to the admin via GET /admin/staff/locations/
   * suggest-code so they can confirm or override it before the branch is
   * created. Never auto-commit this silently: the code gets printed on
   * physical staff ID cards and is effectively permanent once staff are
   * hired against it.
   */
  async suggestBranchCode(name: string): Promise<string> {
    const words = name
      .toUpperCase()
      .replace(/[^A-Z\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter(Boolean);

    const meaningful = words.filter((w) => !StaffService.CODE_STOPWORDS.has(w));
    const candidates = meaningful.length > 0 ? meaningful : words;
    const base = (candidates[0] ?? 'BRN').slice(0, 3);

    const existing = await this.staffLocationModel.findMany({
      select: { code: true },
    });
    const existingCodes = new Set(
      (existing as unknown as { code: string }[]).map((l) => l.code),
    );

    if (!existingCodes.has(base)) return base;

    for (const alt of candidates.slice(1)) {
      const candidate = (base.slice(0, 2) + alt[0]).slice(0, 3);
      if (!existingCodes.has(candidate)) return candidate;
    }

    let n = 2;
    while (existingCodes.has(`${base.slice(0, 2)}${n}`)) n++;
    return `${base.slice(0, 2)}${n}`;
  }

  private async assertLocationExists(
    locationId: string,
    requireActive = false,
  ) {
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
      throw new ConflictException(
        'Staff location with this name already exists',
      );
    }

    const code = dto.code ?? (await this.suggestBranchCode(dto.name));

    const duplicateCode = await this.staffLocationModel.findFirst({
      where: { code },
      select: { id: true },
    });
    if (duplicateCode) {
      throw new ConflictException(
        `Branch code "${code}" is already in use — choose a different code`,
      );
    }

    const location = await this.staffLocationModel.create({
      data: {
        name: dto.name,
        code,
        address: dto.address,
      },
    });

    await this.invalidateLocationCaches();
    return location;
  }

  /**
   * Preview endpoint support — lets the admin UI pre-fill the branch code
   * field before the branch is actually created, without committing to it.
   */
  async previewBranchCode(name: string): Promise<{ suggestedCode: string }> {
    return { suggestedCode: await this.suggestBranchCode(name) };
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
        throw new ConflictException(
          'Staff location with this name already exists',
        );
      }
    }

    if (dto.code) {
      const duplicateCode = await this.staffLocationModel.findFirst({
        where: { id: { not: id }, code: dto.code },
        select: { id: true },
      });

      if (duplicateCode) {
        throw new ConflictException(
          `Branch code "${dto.code}" is already in use — choose a different code`,
        );
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
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await Promise.all([
      this.invalidateLocationCaches(),
      this.redis.delByPattern('staff:list:*'),
      this.redis.delByPattern('staff:one:*'),
      this.redis.delByPattern('staff:birthdays:*'),
    ]);

    return updated;
  }

  async deleteLocation(id: string) {
    await this.assertLocationExists(id);

    const usageCount = await this.staffModel.count({
      where: { locationId: id },
    });
    if (usageCount > 0) {
      throw new ConflictException(
        'Cannot delete location because it is referenced by staff records',
      );
    }

    await this.staffLocationModel.delete({ where: { id } });
    await this.invalidateLocationCaches();
  }

  private async invalidateLocationCaches() {
    await Promise.all([
      this.redis.delByPattern('staff:locations:*'),
      this.redis.delByPattern('branches:open:*'),
    ]);
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

    await this.assertLocationExists(dto.locationId, true);

    // Default: report to the branch manager, unless a different reportingToId
    // was explicitly given or the branch has no manager assigned yet.
    let resolvedReportingToId = dto.reportingToId;
    if (!resolvedReportingToId) {
      const branch = await this.staffLocationModel.findUnique({
        where: { id: dto.locationId },
        select: { managerId: true },
      });
      resolvedReportingToId = (branch as unknown as { managerId?: string | null })?.managerId ?? undefined;
    }

    const startDate = dto.employmentStartDate
      ? new Date(dto.employmentStartDate)
      : new Date();

    const staff = await this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as StaffTransactionClient;

      // Generated inside the transaction: the sequence increment on
      // staff_locations and the staff record creation must commit or roll
      // back together, or a failed staff.create() would permanently burn
      // a sequence number.
      const staffCode = await this.generateStaffCode(
        dto.locationId,
        txClient,
      );

      const created = await txClient.staff.create({
        data: {
          name: dto.name,
          staffCode,
          currentRole: dto.currentRole,
          locationId: dto.locationId,
          email: dto.email?.toLowerCase(),
          phone: this.normalizeNullableString(dto.phone),
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          address: this.normalizeNullableString(dto.address),
          employmentStatus:
            dto.employmentStatus ?? STAFF_EMPLOYMENT_STATUS.ACTIVE,
          userId: dto.userId ?? null,
          reportingToId: resolvedReportingToId ?? null,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : new Date(),
        } as QueryArgs,
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

      // Every new hire gets the full onboarding checklist, regardless of
      // entry point (direct admin creation or via convertToStaff) -- living
      // here, inside create()'s own transaction, means this can never be
      // forgotten by a caller.
      await txClient.staffOnboardingItem.createMany({
        data: ONBOARDING_ITEM_TYPES.map((type) => ({
          staffId: created.id,
          type,
        })),
      });

      return created;
    });

    await this.invalidateCache(staff.id);
    return this.findOne(staff.id);
  }

  /**
   * Dev Feedback Round 7, item #10: a single, reusable "list staff for a
   * dropdown" source -- ACTIVE + ON_LEAVE only by default (both mean
   * "still with the company"; ON_LEAVE staff being missing from these
   * lists was the reported bug). Kept deliberately separate from findAll
   * (the full admin staff list, which needs every status including
   * exited/archived for record-keeping) rather than overloading that
   * endpoint's own filters. Lives on StaffSelfController (Roles: STAFF,
   * not ADMIN/SUPER_ADMIN) rather than AdminStaffController specifically
   * so any authenticated staff member can populate a dropdown on a page
   * they have access to, regardless of whether that page itself needs
   * admin rights -- the same access-mismatch already found and fixed for
   * leave-requests/staff-options in Round 6, item #22.
   */
  async listDropdownOptions(locationId?: string, includeAllStatuses?: boolean) {
    return this.staffModel.findMany({
      where: {
        ...(includeAllStatuses ? {} : { employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] } }),
        ...(locationId && { locationId }),
      },
      select: { id: true, name: true, staffCode: true, locationId: true },
      orderBy: { name: 'asc' },
    });
  }

  async findByUserId(userId: string) {
    const cacheKey = `staff:byUser:${userId}`;
    const cached = await this.redis.get<StaffWithHistories>(cacheKey);
    if (cached) return this.attachApprovedPhotoUrl(cached as unknown as { id: string; passportPhotoUrl?: string | null });

    const staff = await this.staffModel.findUnique({
      where: { userId },
      include: {
        location: true,
        histories: {
          orderBy: { startDate: 'desc' },
          include: { location: true },
        },
        reportingTo: { select: { id: true, name: true, currentRole: true } },
        managedBranch: { select: { id: true, name: true } },
        user: {
          select: {
            adminRole: {
              select: { id: true, name: true, permissions: { select: { permission: true } } },
            },
          },
        },
      } as unknown as QueryArgs,
    });

    if (!staff) {
      throw new NotFoundException('No staff record linked to this account');
    }

    // Flatten for convenience — frontend reads staff.permissions directly
    // rather than digging through user.adminRole.permissions[].permission.
    const rawPermissions = (staff as unknown as { user?: { adminRole?: { permissions?: { permission: string }[] } | null } }).user?.adminRole?.permissions;
    (staff as unknown as { permissions: string[] }).permissions = (rawPermissions ?? []).map((p) => p.permission);

    await this.redis.set(cacheKey, staff, TTL);
    return this.attachApprovedPhotoUrl(staff as unknown as { id: string; passportPhotoUrl?: string | null });
  }

  /**
   * Same as findByUserId(), but returns null instead of throwing when the
   * account has no linked Staff record. For admin-elevated actions (adjust
   * stock, complete a booking, etc.) where attribution to a staff member is
   * nice-to-have but not required — a pure admin account with no Staff
   * profile should still be able to perform these, not get blocked by an
   * audit-trail field that was never meant to gate the action itself.
   */
  async findByUserIdOrNull(userId: string) {
    try {
      return await this.findByUserId(userId);
    } catch {
      return null;
    }
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

  /**
   * Attaches photoUrl to a staff record -- but ONLY if the Passport Photo
   * onboarding item has actually been admin-APPROVED (isComplete), not just
   * uploaded. Always computed fresh, never cached alongside the rest of the
   * staff record, since presigned URLs expire independently of any cache TTL.
   */
  private async attachApprovedPhotoUrl<T extends { id: string; passportPhotoUrl?: string | null }>(
    staff: T,
  ): Promise<T & { photoUrl: string | null }> {
    if (!staff.passportPhotoUrl) {
      return { ...staff, photoUrl: null };
    }
    const item = await this.onboardingItemModel.findFirst({
      where: { staffId: staff.id, type: 'PASSPORT_PHOTO' },
    });
    if (!item || !item.isComplete) {
      return { ...staff, photoUrl: null };
    }
    const photoUrl = await this.s3Service.getPresignedUrl(staff.passportPhotoUrl);
    return { ...staff, photoUrl };
  }

  async findOne(id: string) {
    const cacheKey = `staff:one:${id}`;
    // const cached = await this.redis.get(cacheKey);
    const cached = await this.redis.get<StaffWithHistories>(cacheKey);
    if (cached) return this.attachApprovedPhotoUrl(cached as unknown as { id: string; passportPhotoUrl?: string | null });

    const staff = await this.staffModel.findUnique({
      where: { id },
      include: {
        location: true,
        // Payroll Engine v2, Phase 4: so the staff profile can display
        // the assigned plan's name/rate without a separate API call.
        commissionPlan: { select: { id: true, name: true, commissionRate: true } },
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
    return this.attachApprovedPhotoUrl(staff as unknown as { id: string; passportPhotoUrl?: string | null });
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

    if (dto.reportingToId) {
      if (dto.reportingToId === id) {
        throw new BadRequestException('A staff member cannot report to themselves');
      }
      const manager = await this.staffModel.findFirst({
        where: { id: dto.reportingToId },
        select: { id: true },
      });
      if (!manager) {
        throw new NotFoundException('reportingToId does not match an existing staff record');
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
        ...(dto.responsibilities !== undefined && {
          responsibilities: this.normalizeNullableString(dto.responsibilities),
        }),
        ...(dto.reportingToId !== undefined && {
          reportingToId: dto.reportingToId,
        }),
        ...(dto.hireDate !== undefined && {
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
        }),
        ...(dto.lateGracePeriodOverride !== undefined && {
          lateGracePeriodOverride: dto.lateGracePeriodOverride,
        }),
      },
    });

    await this.invalidateCache(updated.id);
    return this.findOne(updated.id);
  }

  /**
   * Self-service edit — deliberately separate from the general admin `update()`
   * and from the onboarding-item PATCH endpoints (guarantor/emergency-contact/
   * address/reference), which move an onboarding item to SUBMITTED and require
   * re-review. This just updates the field directly, no review side effects,
   * matching the SRS's "staff may self-update contact information" rule.
   */
  async updateMyProfile(staffId: string, dto: { phone?: string }) {
    await this.findOne(staffId);

    const updated = await this.staffModel.update({
      where: { id: staffId },
      data: {
        ...(dto.phone !== undefined && { phone: this.normalizeNullableString(dto.phone) }),
      },
    });

    await this.invalidateCache(updated.id);
    return this.findOne(updated.id);
  }

  async updateStatus(id: string, dto: UpdateStaffStatusDto, actorId?: string) {
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

      if (dto.disciplinaryType) {
        await txClient.disciplinaryAction.create({
          data: {
            staffId: id,
            actorId: actorId ?? null,
            type: dto.disciplinaryType,
            reason: dto.disciplinaryReason,
          },
        });
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
          archivedAt: status === STAFF_EMPLOYMENT_STATUS.ARCHIVED ? now : null,
        },
      });
    });

    await this.invalidateCache(result.id);
    return this.findOne(result.id);
  }

  /**
   * Moves a staff member to a different branch, closing their current
   * StaffEmploymentHistory row and opening a new one there, and issuing a
   * fresh branch-coded staffCode via the same sequence used at hire time.
   * The old code is retired into StaffCodeHistory (unique constraint —
   * can never be reissued to anyone else) rather than deleted, so it stays
   * traceable in any historical record that still references it.
   */
  async transferBranch(id: string, dto: TransferBranchDto, actorId?: string) {
    const staff = (await this.findOne(id)) as unknown as {
      id: string;
      locationId: string;
      staffCode: string;
      currentRole: string;
      createdAt: Date;
    };

    const newLocation = await this.prisma.staffLocation.findUnique({ where: { id: dto.newLocationId } });
    if (!newLocation) throw new NotFoundException('Destination branch not found');
    if (!newLocation.isActive) throw new BadRequestException('Cannot transfer staff to an inactive branch');
    if (staff.locationId === dto.newLocationId) {
      throw new BadRequestException('Staff member is already assigned to this branch');
    }

    const now = new Date();
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : now;
    const oldLocationId = staff.locationId;
    const oldStaffCode = staff.staffCode;

    const result = await this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as StaffTransactionClient;

      // Close the current open employment-history row, open a new one at the new branch.
      const openHistory = await txClient.staffEmploymentHistory.findFirst({
        where: { staffId: id, endDate: null },
        orderBy: { startDate: 'desc' },
      });
      if (openHistory) {
        await txClient.staffEmploymentHistory.update({
          where: { id: openHistory.id },
          data: { endDate: effectiveDate },
        });
      }
      await txClient.staffEmploymentHistory.create({
        data: {
          staffId: id,
          roleTitle: staff.currentRole,
          locationId: dto.newLocationId,
          employmentType: openHistory?.employmentType ?? 'FULL_TIME',
          startDate: effectiveDate,
          reasonForChange: this.normalizeNullableString(dto.reason) ?? 'Branch transfer',
        },
      });

      // Retire the old code — self-healing: if it was never recorded (staff
      // hired before this feature existed, or never transferred before),
      // backfill one row for it now rather than leaving a gap.
      const existingCodeRow = await txClient.staffCodeHistory.findFirst({
        where: { code: oldStaffCode },
      });
      if (existingCodeRow) {
        await txClient.staffCodeHistory.update({
          where: { id: existingCodeRow.id },
          data: { activeUntil: now },
        });
      } else {
        await txClient.staffCodeHistory.create({
          data: {
            staffId: id,
            code: oldStaffCode,
            branchId: oldLocationId,
            activeFrom: staff.createdAt,
            activeUntil: now,
          },
        });
      }

      const newStaffCode = await this.generateStaffCode(dto.newLocationId, txClient);
      await txClient.staffCodeHistory.create({
        data: {
          staffId: id,
          code: newStaffCode,
          branchId: dto.newLocationId,
          activeFrom: effectiveDate,
          reason: this.normalizeNullableString(dto.reason),
        },
      });

      return txClient.staff.update({
        where: { id },
        data: { locationId: dto.newLocationId, staffCode: newStaffCode },
      });
    });

    await this.invalidateCache(result.id);
    return this.findOne(result.id);
  }

  async getCodeHistory(staffId: string) {
    await this.findOne(staffId);
    return this.prisma.staffCodeHistory.findMany({
      where: { staffId },
      orderBy: { activeFrom: 'desc' },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  /**
   * A staff member's current role assignment — the permission set (AdminRole)
   * applies wherever anything checks permissions, in *either* portal. Admin
   * portal login capability (User.role === 'ADMIN') is a separate, explicit
   * flag on top of that — assigning a role doesn't by itself grant a login;
   * see assignRole()'s grantPortalLogin param.
   */
  async getRoleAssignment(staffId: string) {
    const staff = await this.staffModel.findUnique({ where: { id: staffId }, select: { userId: true } }) as unknown as { userId: string | null } | null;
    if (!staff) throw new NotFoundException('Staff record not found');
    if (!staff.userId) {
      return { linkedToUserAccount: false, adminRoleId: null, adminRoleName: null, permissions: [] as string[], hasAdminPortalLogin: false, secondaryRoles: [] as { id: string; name: string }[] };
    }

    const [user, secondary] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: staff.userId },
        select: {
          role: true,
          adminRoleId: true,
          adminRole: { select: { id: true, name: true, permissions: { select: { permission: true } } } },
        },
      }) as unknown as Promise<{
        role: string;
        adminRoleId: string | null;
        adminRole: { id: string; name: string; permissions: { permission: string }[] } | null;
      } | null>,
      this.prisma.userAdminRole.findMany({
        where: { userId: staff.userId },
        include: { adminRole: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      linkedToUserAccount: true,
      adminRoleId: user?.adminRoleId ?? null,
      adminRoleName: user?.adminRole?.name ?? null,
      permissions: (user?.adminRole?.permissions ?? []).map((p) => p.permission),
      hasAdminPortalLogin: user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN',
      secondaryRoles: secondary.map((s) => ({ id: s.adminRole.id, name: s.adminRole.name })),
    };
  }

  /**
   * Assigns a permission role to a staff member. `grantPortalLogin` is
   * independent of the role itself — a Supervisor role can be assigned
   * purely for staff-portal elevation (no admin dashboard access at all),
   * or with portal login on top, entirely by this flag.
   *
   * `mode` determines whether this REPLACES the staff member's existing
   * role (primary — the original behavior, and still the default for
   * backward compatibility) or ADDS this role alongside whatever they
   * already hold (secondary — via UserAdminRole, the same mechanism Roles
   * & Permissions' "Manage Roles" modal uses). grantPortalLogin is ignored
   * in secondary mode: dashboard login capability is only ever governed by
   * the primary role, so a secondary role can't grant or revoke it.
   */
  async assignRole(staffId: string, adminRoleId: string, grantPortalLogin: boolean, actorId?: string, mode: 'primary' | 'secondary' = 'primary') {
    const staff = await this.staffModel.findUnique({ where: { id: staffId }, select: { userId: true, name: true } }) as unknown as { userId: string | null; name: string } | null;
    if (!staff) throw new NotFoundException('Staff record not found');
    if (!staff.userId) {
      throw new BadRequestException(`${staff.name} has no linked login account yet, so a role cannot be assigned. They need to complete account setup first.`);
    }

    const role = await this.prisma.adminRole.findUnique({ where: { id: adminRoleId } });
    if (!role) throw new NotFoundException('The specified admin role does not exist');
    if (!role.isActive) throw new BadRequestException(`Admin role "${role.name}" is inactive`);

    if (mode === 'secondary') {
      const currentUser = await this.prisma.user.findUnique({ where: { id: staff.userId }, select: { adminRoleId: true } });
      if (currentUser?.adminRoleId === adminRoleId) {
        throw new BadRequestException(`"${role.name}" is already this person's primary role`);
      }

      const existing = await this.prisma.userAdminRole.findUnique({
        where: { userId_adminRoleId: { userId: staff.userId, adminRoleId } },
      });
      if (existing) {
        throw new BadRequestException(`${staff.name} already has the "${role.name}" role`);
      }

      await this.prisma.userAdminRole.create({
        data: { userId: staff.userId, adminRoleId, assignedById: actorId },
      });
      await this.prisma.roleAuditLog.create({
        data: {
          action: 'USER_ROLE_ADDED',
          adminRoleId,
          roleName: role.name,
          targetUserId: staff.userId,
          actorId: actorId ?? null,
          before: Prisma.JsonNull,
          after: { targetUserId: staff.userId },
        },
      });
      await this.invalidateCache(staffId);
      return this.getRoleAssignment(staffId);
    }

    const previousRole = await this.prisma.user.findUnique({
      where: { id: staff.userId },
      select: { adminRole: { select: { id: true, name: true } } },
    });

    await this.prisma.user.update({
      where: { id: staff.userId },
      data: { adminRoleId, role: grantPortalLogin ? 'ADMIN' : 'STAFF' },
    });

    await this.prisma.roleAuditLog.create({
      data: {
        action: 'USER_ROLE_ASSIGNED',
        adminRoleId,
        roleName: role.name,
        targetUserId: staff.userId,
        actorId: actorId ?? null,
        before: previousRole?.adminRole ? { id: previousRole.adminRole.id, name: previousRole.adminRole.name } : Prisma.JsonNull,
        after: { id: role.id, name: role.name },
      },
    });

    // Preserve staff-portal access when granting portal login: the base
    // `role` field just became ADMIN, so without an explicit STAFF
    // UserRoleAssignment the multi-role backend guards would no longer see
    // them as STAFF. convertToStaff already grants one at hire, but ensure
    // it exists regardless (e.g. staff created before this feature).
    if (grantPortalLogin) {
      const existingStaffAssignment = await this.prisma.userRoleAssignment.findFirst({
        where: { userId: staff.userId, role: 'STAFF' },
      });
      if (!existingStaffAssignment) {
        await this.prisma.userRoleAssignment.create({
          data: { userId: staff.userId, role: 'STAFF', assignedById: actorId ?? null },
        });
      }
    }

    await this.invalidateCache(staffId);
    return this.getRoleAssignment(staffId);
  }

  async removeRole(staffId: string) {
    const staff = await this.staffModel.findUnique({ where: { id: staffId }, select: { userId: true, name: true } }) as unknown as { userId: string | null; name: string } | null;
    if (!staff) throw new NotFoundException('Staff record not found');
    if (!staff.userId) {
      throw new BadRequestException(`${staff.name} has no linked login account.`);
    }

    await this.prisma.user.update({
      where: { id: staff.userId },
      data: { adminRoleId: null, role: 'STAFF' },
    });

    await this.invalidateCache(staffId);
    return this.getRoleAssignment(staffId);
  }

  async getDisciplinaryActions(staffId: string) {
    await this.findOne(staffId);
    return this.disciplinaryActionModel.findMany({
      where: { staffId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, staffCode: true } } },
    });
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

  /**
   * Lists the onboarding checklist for a staff member, plus a computed
   * `onboardingComplete` flag (true only when every genuinely-active item
   * is complete) -- this is the "flag outstanding items clearly"
   * requirement, surfaced to both the admin dashboard and the staff
   * member's own dashboard.
   *
   * A CANCELLED PHYSICAL_ADDRESS_VERIFICATION is excluded from the
   * every() check -- its onboarding item row still exists with
   * isComplete: false (correctly, it isn't complete), but the admin
   * withdrew the request, so it's no longer something the staff member
   * owes any action on. Without this exclusion, onboardingComplete would
   * be permanently stuck false for that staff member, which matters well
   * beyond just this list -- Payroll access gates on this same flag.
   */
  async getOnboardingItems(staffId: string) {
    const staff = await this.staffModel.findFirst({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }

    const items = await this.onboardingItemModel.findMany({
      where: { staffId },
      orderBy: { type: 'asc' } as QueryArgs,
    });

    const hasAddressVerificationItem = items.some((i) => i.type === 'PHYSICAL_ADDRESS_VERIFICATION');
    let addressVerificationCancelled = false;
    if (hasAddressVerificationItem) {
      const av = await this.prisma.staffAddressVerification.findUnique({ where: { staffId }, select: { status: true } });
      addressVerificationCancelled = av?.status === 'CANCELLED';
    }

    return {
      items,
      onboardingComplete: items.length > 0 && items.every((i) =>
        i.isComplete || (i.type === 'PHYSICAL_ADDRESS_VERIFICATION' && addressVerificationCancelled)
      ),
    };
  }

  /**
   * Dev Feedback Round 4, item #25: which EXTRA branches (beyond their
   * own primary Staff.locationId, always implicitly accessible) this
   * staff member can view/reconcile Branch Finance data for.
   */
  async getFinanceBranches(staffId: string) {
    const rows = await this.prisma.staffManagedFinanceBranch.findMany({
      where: { staffId },
      include: { branch: { select: { id: true, name: true } } },
    });
    return rows.map((r: { branch: { id: string; name: string } }) => r.branch);
  }

  /** Full replace, matching the same pattern already used for approval chains -- send the complete set of additional branches, not an incremental add/remove. */
  async setFinanceBranches(staffId: string, branchIds: string[]) {
    const staff = await this.staffModel.findFirst({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff record not found');

    if (branchIds.length) {
      const found = await this.prisma.staffLocation.findMany({ where: { id: { in: branchIds } }, select: { id: true } });
      if (found.length !== new Set(branchIds).size) {
        throw new BadRequestException('One or more branchIds do not match an existing branch');
      }
    }

    await this.prisma.$transaction([
      this.prisma.staffManagedFinanceBranch.deleteMany({ where: { staffId } }),
      ...(branchIds.length
        ? [this.prisma.staffManagedFinanceBranch.createMany({ data: branchIds.map((branchId) => ({ staffId, branchId })) })]
        : []),
    ]);

    return this.getFinanceBranches(staffId);
  }

  /**
   * Shared by every submitX method below -- moves an item to SUBMITTED
   * (never directly to COMPLETE; only an admin can do that via
   * updateOnboardingItem). Always overwrites to SUBMITTED regardless of
   * prior state, per product decision: resubmitting after approval sends
   * it back for re-review rather than silently keeping the old approval.
   */
  private async markOnboardingSubmitted(
    staffId: string,
    type: (typeof ONBOARDING_ITEM_TYPES)[number],
  ) {
    const item = await this.onboardingItemModel.findFirst({ where: { staffId, type } });
    if (!item) return; // staff record predates the onboarding checklist system -- nothing to update
    await this.onboardingItemModel.update({
      where: { id: item.id },
      data: {
        reviewStatus: 'SUBMITTED',
        submittedAt: new Date(),
      } as QueryArgs,
    });
    await this.invalidateCache(staffId);
  }

  async submitGuarantorInfo(staffId: string, dto: SubmitGuarantorDto) {
    await this.getStaffOrThrow404(staffId);
    await this.staffModel.update({
      where: { id: staffId },
      data: {
        guarantorName: dto.name,
        guarantorOccupation: dto.occupation,
        guarantorPhone: dto.phone,
        guarantorAddress: dto.address,
      },
    });
    await this.markOnboardingSubmitted(staffId, 'GUARANTOR_VERIFICATION');
    return { success: true };
  }

  async submitEmergencyContact(staffId: string, dto: SubmitEmergencyContactDto) {
    await this.getStaffOrThrow404(staffId);
    await this.staffModel.update({
      where: { id: staffId },
      data: {
        emergencyContactName: dto.name,
        emergencyContactPhone: dto.phone,
        emergencyContactRelation: dto.relationship,
      },
    });
    await this.markOnboardingSubmitted(staffId, 'EMERGENCY_CONTACT');
    return { success: true };
  }

  async submitAddress(staffId: string, dto: SubmitAddressDto) {
    await this.getStaffOrThrow404(staffId);
    await this.staffModel.update({
      where: { id: staffId },
      data: { address: dto.address } as QueryArgs,
    });
    await this.markOnboardingSubmitted(staffId, 'ADDRESS_VERIFICATION');
    return { success: true };
  }

  async submitReference(staffId: string, dto: SubmitReferenceDto) {
    await this.getStaffOrThrow404(staffId);
    await this.staffModel.update({
      where: { id: staffId },
      data: {
        referenceName: dto.name,
        referencePhone: dto.phone,
        referenceRelationship: dto.relationship,
      } as QueryArgs,
    });
    await this.markOnboardingSubmitted(staffId, 'REFERENCE_CHECK');
    return { success: true };
  }

  /**
   * Passport photo goes to the same private S3 bucket as applicant CVs --
   * it's personal PII, not something to expose via a stable public link.
   * Stores the S3 KEY on Staff.passportPhotoUrl (name predates this design
   * choice; treat it as a key, not a URL -- see getPassportPhotoViewUrl).
   */
  async submitPassportPhoto(staffId: string, file: { buffer: Buffer; originalname: string; mimetype: string }) {
    await this.getStaffOrThrow404(staffId);
    const key = await this.s3Service.uploadObject(
      file.buffer,
      'staff/passport-photos',
      file.originalname,
      file.mimetype,
    );
    await this.staffModel.update({
      where: { id: staffId },
      data: { passportPhotoUrl: key } as QueryArgs,
    });
    await this.markOnboardingSubmitted(staffId, 'PASSPORT_PHOTO');
    return { success: true };
  }

  /** Fresh presigned view URL for a staff member's passport photo, generated on demand -- never stored as a permanent link. */
  async getPassportPhotoViewUrl(staffId: string): Promise<string | null> {
    const staff = await this.staffModel.findFirst({ where: { id: staffId } });
    const key = (staff as unknown as { passportPhotoUrl: string | null } | null)?.passportPhotoUrl;
    if (!key) return null;
    return this.s3Service.getPresignedUrl(key);
  }

  private async getStaffOrThrow404(staffId: string) {
    const staff = await this.staffModel.findFirst({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }
    return staff;
  }

  /**
   * Admin-wide view -- how many staff still have incomplete onboarding
   * items, and how many items in total. Excludes EXITED/ARCHIVED staff,
   * since their onboarding no longer matters operationally. Used by the
   * dashboard's HR Snapshot card.
   */
  async getOnboardingSummary() {
    const incompleteItems = await this.onboardingItemModel.findMany({
      where: {
        isComplete: false,
        staff: { employmentStatus: { notIn: ['EXITED', 'ARCHIVED'] } },
      } as QueryArgs,
      include: {
        staff: { select: { id: true, name: true, staffCode: true } },
      } as unknown as QueryArgs,
    });

    const byStaff = new Map<string, { staffId: string; name: string; staffCode: string; incompleteCount: number }>();
    for (const item of incompleteItems as unknown as Array<{
      staffId: string;
      staff: { id: string; name: string; staffCode: string };
    }>) {
      const existing = byStaff.get(item.staffId) ?? {
        staffId: item.staffId,
        name: item.staff.name,
        staffCode: item.staff.staffCode,
        incompleteCount: 0,
      };
      existing.incompleteCount += 1;
      byStaff.set(item.staffId, existing);
    }

    return {
      totalIncompleteItems: incompleteItems.length,
      staffWithIncompleteOnboarding: Array.from(byStaff.values()).sort((a, b) => b.incompleteCount - a.incompleteCount),
    };
  }

  /**
   * Marks a single onboarding checklist item complete or reopens it.
   * Records who did it and when -- same audit-trail pattern as employment
   * history notes elsewhere in this service.
   */
  async updateOnboardingItem(
    staffId: string,
    itemId: string,
    dto: UpdateOnboardingItemDto,
    actingAdminId?: string,
  ) {
    const item = await this.onboardingItemModel.findFirst({
      where: { id: itemId, staffId },
    });
    if (!item) {
      throw new NotFoundException('Onboarding item not found for this staff member');
    }

    const updated = await this.onboardingItemModel.update({
      where: { id: itemId },
      data: {
        isComplete: dto.isComplete,
        reviewStatus: dto.isComplete ? 'COMPLETE' : 'NOT_STARTED',
        completedAt: dto.isComplete ? new Date() : null,
        completedBy: dto.isComplete ? (actingAdminId ?? null) : null,
        notes: this.normalizeNullableString(dto.notes),
      } as QueryArgs,
    });

    await this.invalidateCache(staffId);
    return updated;
  }

  /**
   * Called by CompanyDocumentService after recording an acknowledgment --
   * kept here rather than in that service so the StaffOnboardingItem table
   * has exactly one owner. Auto-completes the POLICY_ACKNOWLEDGMENT item
   * (completedBy left null to distinguish "system-completed" from an admin
   * manually toggling a checkbox) the moment every currently-active company
   * document has been acknowledged by this staff member. Does nothing if
   * no documents are configured yet, or the item is already complete.
   */
  async checkAndCompletePolicyAcknowledgment(staffId: string) {
    const prismaAny = this.prisma as unknown as {
      companyDocument: {
        count(args: QueryArgs): Promise<number>;
      };
    };

    const activeDocCount = await prismaAny.companyDocument.count({ where: { isActive: true } });
    if (activeDocCount === 0) return;

    const unacknowledgedCount = await prismaAny.companyDocument.count({
      where: { isActive: true, acknowledgments: { none: { staffId } } },
    });
    if (unacknowledgedCount > 0) return;

    const item = await this.onboardingItemModel.findFirst({
      where: { staffId, type: 'POLICY_ACKNOWLEDGMENT' },
    });
    if (item && !item.isComplete) {
      await this.onboardingItemModel.update({
        where: { id: item.id },
        data: {
          isComplete: true,
          completedAt: new Date(),
          completedBy: null,
          notes: 'Auto-completed: all active company documents acknowledged',
        },
      });
      await this.invalidateCache(staffId);
    }
  }

  /**
   * Generates a one-page staff ID card as a PDF, on demand -- not stored,
   * regenerated fresh on every request so it can never go stale if the
   * staff member's name, role, or branch changes. QR code encodes the
   * staff code, so a front-desk scanner can read it directly -- reused as
   * the same code that Phase 3 attendance check-in will scan.
   */
  async generateIdCardPdf(staffId: string): Promise<Buffer> {
    const staff = await this.staffModel.findFirst({
      where: { id: staffId },
      include: { location: true },
    } as QueryArgs);
    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }

    const location = (staff as unknown as { location?: StaffLocationRecord }).location;

    // Portrait CR80 -- 2.125in x 3.375in, same physical card stock as a
    // credit card, just held vertically (a standard lanyard badge size).
    const W = 153, H = 243;

    // Verification page base URL, defaulting to the production domain --
    // the QR code must point at a page a phone camera opens directly, not
    // the raw API endpoint (which would just show JSON).
    const verificationBaseUrl =
      this.configService.get<string>('STAFF_ID_VERIFICATION_URL') ||
      'https://hairlux.com.ng/verify-staff.html';
    const verificationUrl = `${verificationBaseUrl}?code=${encodeURIComponent(staff.staffCode)}`;
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 200 });
    const qrPngBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([W, H]);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const qrImage = await pdfDoc.embedPng(qrPngBytes);
    const logoImage = await pdfDoc.embedPng(Buffer.from(HAIRLUX_LOGO_BASE64, 'base64'));

    const dark = rgb(0.071, 0.063, 0.051);
    const gold = rgb(0.616, 0.510, 0.290);
    const white = rgb(1, 1, 1);
    const lightGray = rgb(0.69, 0.69, 0.68);
    const panelBorder = rgb(0.227, 0.212, 0.188);
    const photoBoxBg = rgb(0.149, 0.149, 0.149);

    const centerText = (text: string, y: number, font: typeof boldFont, size: number, color: typeof gold) => {
      const width = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (W - width) / 2, y, size, font, color });
    };

    // Force-breaks a single word character-by-character at minSize -- the
    // hard-guarantee fallback for a word with no spaces at all (word-wrap
    // alone can never break it) that's still too wide even at the
    // smallest allowed font size. Physical print material can never be
    // allowed to silently overflow, verified against a pathological
    // 30-character single-word test case.
    const forceBreakWord = (word: string, font: typeof boldFont, size: number, maxWidth: number): string[] => {
      const lines: string[] = [];
      let current = '';
      for (const ch of word) {
        const candidate = current + ch;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
          current = candidate;
        } else {
          lines.push(current);
          current = ch;
        }
      }
      if (current) lines.push(current);
      return lines;
    };

    /**
     * Greedy word-wrap into as many lines as needed to fit maxWidth at the
     * given font size, shrinking the font (down to minSize) only if a
     * single word is still too wide to fit even alone -- fixes the name-
     * overflow bug, where a long name at a fixed size just ran off the
     * card with no wrapping or shrinking at all. Falls back to
     * forceBreakWord as a last resort if even minSize isn't enough.
     */
    const wrapText = (text: string, font: typeof boldFont, startSize: number, minSize: number, maxWidth: number): { lines: string[]; size: number } => {
      let size = startSize;
      while (size >= minSize) {
        const words = text.split(' ');
        const lines: string[] = [];
        let current = '';
        let overflowed = false;
        for (const word of words) {
          const candidate = current ? current + ' ' + word : word;
          if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            current = candidate;
          } else {
            if (!current) { overflowed = true; break; }
            lines.push(current);
            current = word;
          }
        }
        if (!overflowed) {
          if (current) lines.push(current);
          return { lines, size };
        }
        size -= 1;
      }
      const words = text.split(' ');
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        if (font.widthOfTextAtSize(word, minSize) > maxWidth) {
          if (current) { lines.push(current); current = ''; }
          lines.push(...forceBreakWord(word, font, minSize, maxWidth));
        } else {
          const candidate = current ? current + ' ' + word : word;
          if (font.widthOfTextAtSize(candidate, minSize) <= maxWidth) {
            current = candidate;
          } else {
            if (current) lines.push(current);
            current = word;
          }
        }
      }
      if (current) lines.push(current);
      return { lines, size: minSize };
    };

    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: dark });

    // Logo + wordmark header. All numbers below were verified by actually
    // rendering test cards (short name, a wrapped long name, and a
    // pathological 30-character single word with no spaces) rather than
    // hand-calculated -- an earlier version of this math had the wordmark
    // sitting ~26pt below the logo instead of directly under it.
    // No separate "HAIRLUX SALON & SPA" text label -- the logo image
    // itself is the full lockup (mark + wordmark baked in), verified
    // legible at this render size against the card's dark background
    // before removing the redundant duplicate text underneath it.
    const logoDims = logoImage.scale(1);
    const logoDisplayHeight = 24;
    const logoDisplayWidth = (logoDims.width / logoDims.height) * logoDisplayHeight;
    const logoTop = H - 12;
    const logoBottom = logoTop - logoDisplayHeight;
    page.drawImage(logoImage, {
      x: (W - logoDisplayWidth) / 2, y: logoBottom, width: logoDisplayWidth, height: logoDisplayHeight,
    });

    const panelTop = logoBottom - 10;
    const panelBottom = 14;
    page.drawRectangle({
      x: 10, y: panelBottom, width: W - 20, height: panelTop - panelBottom,
      borderColor: panelBorder, borderWidth: 1,
    });

    // Name is wrapped/measured BEFORE the photo, since photo size and every
    // gap below it now adapt to whether the name needed 1 or 2+ lines --
    // reclaiming exactly the extra space a wrapped name costs, rather than
    // a fixed budget that only worked for short names (which is what
    // caused the original overflow bug this whole section fixes).
    const nameMaxWidth = W - 24;
    const { lines: nameLines, size: nameSize } = wrapText(staff.name.toUpperCase(), boldFont, 12, 8, nameMaxWidth);
    const isTwoLineName = nameLines.length > 1;

    // Only embed the photo if it's actually been admin-approved -- an
    // uploaded-but-unreviewed photo shouldn't appear on an official ID card.
    const photoSize = isTwoLineName ? 44 : 50;
    const photoTop = panelTop - (isTwoLineName ? 8 : 9);
    const photoY = photoTop - photoSize;
    let hasPhoto = false;
    const photoKey = (staff as unknown as { passportPhotoUrl: string | null }).passportPhotoUrl;
    if (photoKey) {
      const photoItem = await this.onboardingItemModel.findFirst({
        where: { staffId, type: 'PASSPORT_PHOTO' },
      });
      if (photoItem?.isComplete) {
        try {
          const photoBytes = await this.s3Service.downloadObject(photoKey);
          let embeddedPhoto;
          try {
            embeddedPhoto = await pdfDoc.embedJpg(photoBytes);
          } catch {
            embeddedPhoto = await pdfDoc.embedPng(photoBytes);
          }
          page.drawImage(embeddedPhoto, {
            x: (W - photoSize) / 2, y: photoY, width: photoSize, height: photoSize,
          });
          hasPhoto = true;
        } catch (err) {
          this.logger.warn(
            `Could not embed passport photo for staff ${staffId} on ID card: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    if (!hasPhoto) {
      page.drawRectangle({
        x: (W - photoSize) / 2, y: photoY, width: photoSize, height: photoSize,
        color: photoBoxBg, borderColor: gold, borderWidth: 1,
      });
      centerText('PHOTO', photoY + photoSize / 2 - 3, regularFont, 7, lightGray);
    }

    const nameLineHeight = nameSize + 2;
    let nameCursorY = photoY - (isTwoLineName ? 14 : 16);
    nameLines.forEach((line) => {
      centerText(line, nameCursorY, boldFont, nameSize, white);
      nameCursorY -= nameLineHeight;
    });

    const roleY = nameCursorY - (isTwoLineName ? 2 : 4);
    const branchY = roleY - (isTwoLineName ? 11 : 12);
    centerText(staff.currentRole, roleY, regularFont, 8, lightGray);
    centerText(location?.name ?? 'Branch unassigned', branchY, regularFont, 8, lightGray);

    const codeY = branchY - (isTwoLineName ? 14 : 18);
    centerText(staff.staffCode, codeY, boldFont, 10, gold);

    const qrSize = isTwoLineName ? 34 : 38;
    const qrTop = codeY - (isTwoLineName ? 8 : 12);
    const qrY = qrTop - qrSize;
    page.drawImage(qrImage, { x: (W - qrSize) / 2, y: qrY, width: qrSize, height: qrSize });

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  /**
   * Powers the public ID-card QR verification page -- deliberately returns
   * only non-sensitive fields (name, photo, role, branch, staff code).
   * Never phone, email, salary, NIN, address, or anything else on the
   * Staff record. A person no longer ACTIVE/ON_LEAVE (exited, suspended,
   * archived) does NOT verify as a current employee -- an ID card must
   * stop confirming someone's employment the moment that's no longer
   * true, which is the whole point of this being a live lookup rather
   * than static text printed on the card.
   */
  async verifyByStaffCode(staffCode: string) {
    const staff = await this.staffModel.findFirst({
      where: { staffCode },
      include: { location: true },
    } as QueryArgs);

    if (!staff || !['ACTIVE', 'ON_LEAVE'].includes(staff.employmentStatus)) {
      return { verified: false as const };
    }

    const location = (staff as unknown as { location?: StaffLocationRecord }).location;
    let photoUrl: string | null = null;
    const photoKey = (staff as unknown as { passportPhotoUrl: string | null }).passportPhotoUrl;
    if (photoKey) {
      const photoItem = await this.onboardingItemModel.findFirst({
        where: { staffId: staff.id, type: 'PASSPORT_PHOTO' },
      });
      if (photoItem?.isComplete) {
        try {
          photoUrl = await this.s3Service.getPresignedUrl(photoKey);
        } catch {
          photoUrl = null;
        }
      }
    }

    return {
      verified: true as const,
      name: staff.name,
      role: staff.currentRole,
      branch: location?.name ?? null,
      staffCode: staff.staffCode,
      photoUrl,
    };
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
        const previousYear = staff.birthdayLastEmailedYear;
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
          try {
            await this.mailService.sendStaffBirthdayEmail(email, firstName);
            this.logger.log(`Birthday email queued for staff ${staff.id}`);
          } catch (queueError) {
            const rolledBack = await this.staffModel.updateMany({
              where: {
                id: staff.id,
                birthdayLastEmailedYear: currentYear,
              },
              data: {
                birthdayLastEmailedYear: previousYear,
              },
            });

            this.logger.error(
              `Birthday email queue failed for staff ${staff.id}; marker rollback ${rolledBack.count > 0 ? 'succeeded' : 'did not apply'}: ${queueError instanceof Error
                ? queueError.message
                : String(queueError)
              }`,
            );
          }
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

  /**
   * Resolves the login email a legacy staff record should use, generating a
   * collision-safe company email (firstname.lastname@hairlux.com.ng) when
   * the Staff record has none on file.
   *
   * Splits on whitespace: first token = first name, last token = last name
   * (middle names dropped). Single-word names use the same word twice —
   * flagged separately by the caller since it's worth a human glancing at.
   */
  private async generateCompanyEmail(name: string): Promise<string> {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const firstName = (parts[0] ?? 'staff').toLowerCase().replace(/[^a-z]/g, '');
    const lastName = (parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? 'member')
      .toLowerCase()
      .replace(/[^a-z]/g, '');

    const base = `${firstName}.${lastName}`;
    let candidate = `${base}@hairlux.com.ng`;
    let suffix = 2;

    // Check both users.email and staff.email — either could already hold
    // this address (e.g. two staff who happen to share a first+last name).
    while (
      (await this.prisma.user.findUnique({ where: { email: candidate } })) ||
      (await this.staffModel.findFirst({ where: { email: candidate }, select: { id: true } }))
    ) {
      candidate = `${base}${suffix}@hairlux.com.ng`;
      suffix += 1;
    }

    return candidate;
  }

  /**
   * DRY RUN ONLY — computes what would happen for every legacy staff record
   * (userId currently null) without creating or modifying anything. Surface
   * this to an admin before they trigger any real account creation.
   */
  async previewLegacyAccountBackfill() {
    const legacyStaff = await this.staffModel.findMany({
      where: { userId: null } as QueryArgs,
      select: {
        id: true,
        name: true,
        staffCode: true,
        email: true,
      } as unknown as QueryArgs,
    });

    const plan: Array<{
      staffId: string;
      name: string;
      staffCode: string;
      resolvedEmail: string;
      emailSource: 'existing_staff_email' | 'generated';
      action: 'link_existing_user' | 'create_new_user';
      singleWordNameWarning: boolean;
      existingUserId?: string;
    }> = [];

    // Generated candidates must not collide with each other WITHIN this
    // same preview pass either, not just against the database — two staff
    // sharing a name in the same run would otherwise both compute the same
    // "next available" suffix.
    const reservedThisRun = new Set<string>();

    for (const s of legacyStaff as unknown as Array<{
      id: string; name: string; staffCode: string; email: string | null;
    }>) {
      const singleWordNameWarning = s.name.trim().split(/\s+/).filter(Boolean).length < 2;

      let resolvedEmail: string;
      let emailSource: 'existing_staff_email' | 'generated';

      if (s.email) {
        resolvedEmail = s.email;
        emailSource = 'existing_staff_email';
      } else {
        let candidate = await this.generateCompanyEmail(s.name);
        while (reservedThisRun.has(candidate)) {
          const [local, domain] = candidate.split('@');
          const match = local.match(/^(.*?)(\d*)$/);
          const base = match?.[1] ?? local;
          const n = (match?.[2] ? parseInt(match[2], 10) : 1) + 1;
          candidate = `${base}${n}@${domain}`;
        }
        reservedThisRun.add(candidate);
        resolvedEmail = candidate;
        emailSource = 'generated';
      }

      const existingUser = await this.prisma.user.findUnique({
        where: { email: resolvedEmail },
        select: { id: true },
      });

      plan.push({
        staffId: s.id,
        name: s.name,
        staffCode: s.staffCode,
        resolvedEmail,
        emailSource,
        action: existingUser ? 'link_existing_user' : 'create_new_user',
        singleWordNameWarning,
        ...(existingUser ? { existingUserId: existingUser.id } : {}),
      });
    }

    return plan;
  }

  /**
   * REAL ACTION — admin-triggered, one staff member at a time, only after
   * the admin has given that person a heads-up in person (per product
   * decision — this is NOT auto-fired for all legacy staff at once).
   *
   * Mirrors ApplicationService.convertToStaff()'s user-resolution pattern
   * exactly: existing account found by email gets STAFF granted alongside
   * whatever they already are; no account found gets a fresh User with a
   * random, never-transmitted password, credentials set via the same
   * password-setup email link flow.
   */
  async linkUserAccountForStaff(staffId: string, actingAdminId?: string) {
    const staff = await this.staffModel.findFirst({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }
    if ((staff as unknown as { userId: string | null }).userId) {
      throw new ConflictException('This staff member already has a linked user account');
    }

    const email = staff.email ?? (await this.generateCompanyEmail(staff.name));

    let user = await this.prisma.user.findUnique({ where: { email } });
    const wasExistingUser = !!user;

    if (user) {
      const existingStaff = await this.staffModel.findFirst({
        where: { userId: user.id } as QueryArgs,
        select: { id: true, staffCode: true } as unknown as QueryArgs,
      });
      if (existingStaff) {
        throw new ConflictException(
          `${email} is already linked to another staff member (${(existingStaff as unknown as { staffCode: string }).staffCode}).`,
        );
      }

      const existingAssignment = await this.prisma.userRoleAssignment.findUnique({
        where: { userId_role: { userId: user.id, role: 'STAFF' } },
      });
      if (!existingAssignment) {
        await this.prisma.userRoleAssignment.create({
          data: { userId: user.id, role: 'STAFF', assignedById: actingAdminId ?? null },
        });
      }
    } else {
      const nameParts = staff.name.trim().split(/\s+/).filter(Boolean);
      const randomPassword = crypto.randomBytes(24).toString('hex');
      const hashedPassword = await argon2.hash(randomPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 4,
        parallelism: 1,
      });

      user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName: nameParts[0] ?? staff.name,
          lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] ?? staff.name,
          phone: staff.phone,
          role: 'STAFF',
          status: 'ACTIVE',
          // Unlike a new hire (verified via NIN + OTP during application),
          // nobody has verified this address — it's either a pre-existing
          // staff email of unknown provenance, or a freshly generated one
          // nobody has received mail at yet.
          emailVerified: false,
        },
      });

      await this.prisma.userRoleAssignment.create({
        data: { userId: user.id, role: 'STAFF', assignedById: actingAdminId ?? null },
      });
    }

    // Backfill the email onto the Staff record too if it didn't have one,
    // so future lookups are consistent and this generation logic never
    // has to run twice for the same person.
    await this.staffModel.update({
      where: { id: staffId },
      data: { userId: user.id, ...(staff.email ? {} : { email }) } as QueryArgs,
    });

    await this.authService.initiatePasswordSetup(user.id);
    await this.invalidateCache(staffId);

    return { staffId, email, userId: user.id, wasExistingUser };
  }

  async getCompensation(staffId: string) {
    const application = await this.prisma.application.findFirst({
      where: { staffId },
      include: { offerLetter: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!application?.offerLetter) {
      return null; // no offer-letter record exists for this staff member (e.g. seeded/legacy staff, not hired through Recruitment)
    }

    const { baseSalary, allowances, compensationNote, effectiveDate, role } = application.offerLetter;
    return {
      role,
      baseSalary: Number(baseSalary),
      allowances: allowances ? Number(allowances) : null,
      compensationNote,
      effectiveDate,
    };
  }
}