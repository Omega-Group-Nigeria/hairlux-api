import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { ApplicationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StaffService } from '../staff/staff.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { QueryApplicationDto } from './dto/query-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { AuthService } from 'src/auth/auth.service';
import { S3Service } from '../storage/s3.service';


const TTL = 300;

type ApplicationRecord = {
  id: string;
  applicationCode: string;
  jobId: string | null;
  appliedRole: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  nin: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string;
  address: string;
  email: string;
  yearsOfExperience: string | null;
  previousEmployer: string | null;
  previousEmployerAddress: string | null;
  previousEmployerPhone: string | null;
  coverNote: string;
  preferredLocationId: string | null;
  preferredBranchText: string | null;
  cvUrl: string | null;
  portfolioUrl: string | null;
  status: ApplicationStatus;
  interviewMode: 'IN_PERSON' | 'VIRTUAL' | null;
  interviewMeetingUrl: string | null;
  interviewScheduledAt: Date | null;
  interviewLocationId: string | null;
  interviewLocation?: { id: string; name: string } | null;
  interviewerName: string | null;
  interviewNote: string | null;
  notSelectedReason: string | null;
  otpHash: string | null;
  otpExpiresAt: Date | null;
  staffId: string | null;
  employedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type QueryArgs = Record<string, unknown>;

interface ApplicationModelDelegate {
  findFirst(args: QueryArgs): Promise<ApplicationRecord | null>;
  findMany(args: QueryArgs): Promise<ApplicationRecord[]>;
  findUnique(args: QueryArgs): Promise<ApplicationRecord | null>;
  create(args: QueryArgs): Promise<ApplicationRecord>;
  update(args: QueryArgs): Promise<ApplicationRecord>;
  count(args?: QueryArgs): Promise<number>;
}

@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private staffService: StaffService,
    private mailService: MailService,
    private configService: ConfigService,
    private authService: AuthService,
    private s3Service: S3Service
    
  ) {}

  private get applicationModel(): ApplicationModelDelegate {
    return (
      this.prisma as unknown as { application: ApplicationModelDelegate }
    ).application;
  }

  private async invalidateCache(applicationId?: string) {
    await Promise.all([
      this.redis.delByPattern('application:list:*'),
      ...(applicationId
        ? [this.redis.del(`application:one:${applicationId}`)]
        : []),
    ]);
  }

  private normalizeNullableString(value?: string | null): string | null {
    if (value === undefined) return null;
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async generateApplicationCode(): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = Math.floor(Math.random() * 1_000_000)
        .toString()
        .padStart(6, '0');
      const code = `HL-APP-${year}-${suffix}`;

      const existing = await this.applicationModel.findFirst({
        where: { applicationCode: code },
        select: { id: true },
      });

      if (!existing) return code;
    }

    throw new ConflictException(
      'Could not generate a unique application code. Please try again.',
    );
  }
  
  private async generateOtp(): Promise<{ otp: string; otpHash: string; otpExpiresAt: Date }> {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = await argon2.hash(otp);
  const otpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  return { otp, otpHash, otpExpiresAt };
}

  async submit(dto: CreateApplicationDto) {
    const applicationCode = await this.generateApplicationCode();
    const { otp, otpHash, otpExpiresAt } = await this.generateOtp();

    const application = await this.applicationModel.create({
      data: {
        applicationCode,
        jobId: dto.jobId ?? null,
        appliedRole: this.normalizeNullableString(dto.appliedRole),
        firstName: dto.firstName,
        middleName: this.normalizeNullableString(dto.middleName),
        lastName: dto.lastName,
        nin: dto.nin,
        dateOfBirth: this.normalizeNullableString(dto.dateOfBirth),
        gender: this.normalizeNullableString(dto.gender),
        phone: dto.phone,
        address: dto.address,
        email: dto.email.toLowerCase(),
        yearsOfExperience: this.normalizeNullableString(dto.yearsOfExperience),
        previousEmployer: this.normalizeNullableString(dto.previousEmployer),
        previousEmployerAddress: this.normalizeNullableString(
          dto.previousEmployerAddress,
        ),
        previousEmployerPhone: this.normalizeNullableString(
          dto.previousEmployerPhone,
        ),
        coverNote: dto.coverNote,
        preferredLocationId: dto.preferredLocationId ?? null,
        preferredBranchText: this.normalizeNullableString(
          dto.preferredBranchText,
        ),
        cvUrl: this.normalizeNullableString(dto.cvUrl),
        portfolioUrl: this.normalizeNullableString(dto.portfolioUrl),
        status: ApplicationStatus.SUBMITTED,
        otpHash,
        otpExpiresAt,
      },
    });

    const dashboardUrl =
      this.configService.get<string>('APPLICANT_DASHBOARD_URL') ||
      'https://hairlux.com.ng/login.html';

    this.mailService.sendApplicationConfirmationEmail(application.email, application.firstName, {
      applicationCode,
      otp,
      dashboardUrl,
    })
    .catch((err) => {
      this.logger.error(`Failed to queue application confirmation email for ${application.email}: ${err instanceof Error ? err.message : String(err)}`,);
    });

    await this.invalidateCache();
    return this.findOne(application.id);
  }

  async requestOtp(applicationCode: string, email: string) {
  const application = await this.applicationModel.findFirst({
    where: { applicationCode },
  });

  // Same response whether the code doesn't exist or the email doesn't
  // match — don't let this endpoint be used to probe which application
  // codes are real or confirm an applicant's email address.
  if (!application || application.email.toLowerCase() !== email.toLowerCase()) {
    return; // controller returns a generic success message regardless
  }

  const { otp, otpHash, otpExpiresAt } = await this.generateOtp();

  await this.applicationModel.update({
    where: { id: application.id },
    data: { otpHash, otpExpiresAt },
  });

  await this.mailService.sendApplicationOtpEmail(application.email, application.firstName, {
    applicationCode: application.applicationCode,
    otp,
    dashboardUrl:
      this.configService.get<string>('APPLICANT_DASHBOARD_URL') ||
      'https://hairlux.com.ng/login.html',
  });
}

async verifyOtp(applicationCode: string, otp: string): Promise<string> {
  const application = await this.applicationModel.findFirst({
    where: { applicationCode },
  });

  if (!application || !application.otpHash || !application.otpExpiresAt) {
    throw new BadRequestException('Invalid application code or OTP');
  }

  if (application.otpExpiresAt < new Date()) {
    throw new BadRequestException('This OTP has expired — request a new one');
  }

  const valid = await argon2.verify(application.otpHash, otp);
  if (!valid) {
    throw new BadRequestException('Invalid application code or OTP');
  }

  return application.id;
}

  async findAll(queryDto: QueryApplicationDto) {
    const cacheKey = `application:list:${JSON.stringify(queryDto)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const {
      page = 1,
      limit = 20,
      search,
      status,
      preferredLocationId,
      jobId,
    } = queryDto;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (preferredLocationId) where.preferredLocationId = preferredLocationId;
    if (jobId) where.jobId = jobId;

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { applicationCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      this.applicationModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.applicationModel.count({ where }),
    ]);

    const result = {
      data: await Promise.all(applications.map((a) => this.sanitize(a))),
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
    const cacheKey = `application:one:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const application = await this.applicationModel.findUnique({
      where: { id },
      include: { interviewLocation: { select: { id: true, name: true } } }, 
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const sanitized = await this.sanitize(application);
    await this.redis.set(cacheKey, sanitized, TTL);
    return sanitized;
  }

  private async sanitize(application: ApplicationRecord) {
    const { otpHash, otpExpiresAt, cvUrl, interviewLocation, ...rest } = application;
    void otpHash;
    void otpExpiresAt;
    let cvDownloadUrl: string | null = null;
    if (cvUrl) {
      try {
        cvDownloadUrl = await this.s3Service.getPresignedUrl(cvUrl);
      } catch {
        cvDownloadUrl = null;
      }
    }
    return { ...rest, cvDownloadUrl, interviewLocationName: interviewLocation?.name ?? null };
  }

  async updateStatus(id: string, dto: UpdateApplicationStatusDto) {
    const existing = await this.applicationModel.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Application not found');
    }
    if (existing.status === ApplicationStatus.EMPLOYED) {
      throw new BadRequestException('This application has already been converted to a staff record');
    }
    if (dto.status === ApplicationStatus.EMPLOYED) {
      throw new BadRequestException('Use POST /admin/applications/:id/convert-to-staff to mark an applicant as employed');
    }

    const updated = await this.applicationModel.update({
      where: { id },
      data: {
        status: dto.status,
        notSelectedReason: dto.status === ApplicationStatus.NOT_SELECTED
          ? this.normalizeNullableString(dto.reason)
          : null,
      },
    });

    this.notifyStatusChange(updated);

    await this.invalidateCache(updated.id);
    return this.findOne(updated.id);
  }

  private notifyStatusChange(application: ApplicationRecord) {
    const status = application.status;
    if (status !== 'SHORTLISTED' && status !== 'OFFER_EXTENDED' && status !== 'NOT_SELECTED') return;

    const dashboardUrl = this.configService.get<string>('APPLICANT_DASHBOARD_URL')
      || 'https://hairlux.com.ng/careers.html';

    this.mailService
      .sendApplicationStatusUpdateEmail(application.email, application.firstName, status, {
        applicationCode: application.applicationCode,
        dashboardUrl,
        reason: status === 'NOT_SELECTED' ? (application.notSelectedReason ?? undefined) : undefined,
      })
      .catch((err) => {
        this.logger.error(`Failed to queue status-update email for ${application.email}: ${err instanceof Error ? err.message : String(err)}`);
      });
  }

  async scheduleInterview(id: string, dto: ScheduleInterviewDto) {
  const existing = await this.applicationModel.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException('Application not found');
  }

  const updated = await this.applicationModel.update({
    where: { id },
    data: {
      status: ApplicationStatus.INTERVIEW_SCHEDULED,
      interviewScheduledAt: new Date(dto.scheduledAt),
      interviewMode: dto.mode,
      interviewLocationId: dto.mode === 'IN_PERSON' ? dto.locationId : null,
      interviewMeetingUrl: dto.mode === 'VIRTUAL' ? dto.meetingUrl : null,
      interviewerName: dto.interviewerName,
      interviewNote: this.normalizeNullableString(dto.note),
    },
  });

  this.notifyInterviewScheduled(updated, dto);

  await this.invalidateCache(updated.id);
  return this.findOne(updated.id);
}

  private notifyInterviewScheduled(application: ApplicationRecord, dto: ScheduleInterviewDto) {
    const dashboardUrl = this.configService.get<string>('APPLICANT_DASHBOARD_URL')
      || 'https://hairlux.com.ng/careers.html';

    const sendEmail = async () => {
      let locationName: string | undefined;
      if (dto.mode === 'IN_PERSON' && dto.locationId) {
        const loc = await this.prisma.staffLocation.findUnique({
          where: { id: dto.locationId },
          select: { name: true },
        });
        locationName = loc?.name;
      }

    await this.mailService.sendInterviewScheduledEmail(application.email, application.firstName, {
      applicationCode: application.applicationCode,
      scheduledAt: new Date(dto.scheduledAt),
      mode: dto.mode,
      locationName,
      meetingUrl: dto.meetingUrl,
      interviewerName: dto.interviewerName,
      note: dto.note,
      dashboardUrl,
    });
  };

  sendEmail().catch((err) => {
    this.logger.error(`Failed to queue interview-scheduled email for ${application.email}: ${err instanceof Error ? err.message : String(err)}`);
  });
}

  /**
   * Converts a hired applicant into a staff record, reusing StaffService so
   * staff codes, opening employment history, and duplicate-email checks all
   * happen exactly the same way as a manually-created staff record.
   */
  async convertToStaff(id: string, locationId: string, actingAdminId?: string) {
  const application = await this.applicationModel.findUnique({ where: { id } });
  if (!application) {
    throw new NotFoundException('Application not found');
  }
  if (application.status === ApplicationStatus.EMPLOYED) {
    throw new ConflictException('This application has already been converted to a staff record');
  }

  const fullName = [application.firstName, application.middleName, application.lastName]
    .filter(Boolean).join(' ');

  // ── Resolve or create the User account ──
  let user = await this.prisma.user.findUnique({ where: { email: application.email } });

  if (user) {
    // Existing account (e.g. a customer being hired) — their password and
    // legacy role are never touched. STAFF is granted alongside whatever
    // they already are.
    const existing = await this.prisma.userRoleAssignment.findUnique({
      where: { userId_role: { userId: user.id, role: 'STAFF' } },
    });
    if (!existing) {
      await this.prisma.userRoleAssignment.create({
        data: { userId: user.id, role: 'STAFF', assignedById: actingAdminId ?? null },
      });
    }
  } else {
    // Random, never-communicated password — the real credential is set via
    // the password-setup email below.
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const hashedPassword = await argon2.hash(randomPassword, {
      type: argon2.argon2id, memoryCost: 65536, timeCost: 4, parallelism: 1,
    });

    user = await this.prisma.user.create({
      data: {
        email: application.email,
        password: hashedPassword,
        firstName: application.firstName,
        lastName: application.lastName,
        phone: application.phone,
        role: 'STAFF',
        status: 'ACTIVE',
        emailVerified: true, // already verified via NIN + OTP during application
      },
    });

    await this.prisma.userRoleAssignment.create({
      data: { userId: user.id, role: 'STAFF', assignedById: actingAdminId ?? null },
    });
  }

  // ── Create the Staff HR record, linked to the User ──
  const staff = await this.staffService.create({
    name: fullName,
    currentRole: application.appliedRole ?? 'Staff',
    locationId,
    email: application.email,
    phone: application.phone,
    employmentStatus: 'ACTIVE',
    employmentNotes: `Converted from application ${application.applicationCode}`,
    userId: user.id,
  });

  await this.applicationModel.update({
    where: { id },
    data: { status: ApplicationStatus.EMPLOYED, staffId: staff.id, employedAt: new Date() },
  });

  await this.authService.initiatePasswordSetup(user.id);

  await this.invalidateCache(id);
  return staff;
}
}