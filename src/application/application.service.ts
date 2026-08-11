import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationStatus, InterviewOutcome, OfferLetterStatus, } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { AuthService } from 'src/auth/auth.service';
import { MailService } from '../mail/mail.service';
import { QoreidRequestError, QoreidService } from '../nin/qoreid.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StaffService } from '../staff/staff.service';
import { S3Service } from '../storage/s3.service';
import { ApproveEmploymentDto } from './dto/approve-employment.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { GenerateOfferLetterDto } from './dto/generate-offer-letter.dto';
import { QueryApplicationDto } from './dto/query-application.dto';
import { RecordInterviewOutcomeDto } from './dto/record-interview-outcome.dto';
import { OfferResponseAction, RespondToOfferDto } from './dto/respond-to-offer.dto';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

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
  phone: string | null;
  address: string | null;
  email: string | null;
  ninVerified: boolean;
  ninVerifiedAt: Date | null;
  ninPhotoUrl: string | null;
  ninVerificationFailReason: string | null;
  yearsOfExperience: string | null;
  previousEmployer: string | null;
  previousEmployerAddress: string | null;
  previousEmployerPhone: string | null;
  coverNote: string | null;
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
  interviewOutcome: 'PASS' | 'FAIL' | 'HOLD' | null;
  interviewerId: string | null;
  notSelectedReason: string | null;
  otpHash: string | null;
  otpExpiresAt: Date | null;
  staffId: string | null;
  employedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employmentApproval?: { id: string; approvedById: string; approvedAt: Date; notes: string | null } | null;
  offerLetter?: {
    id: string;
    status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN';
    baseSalary: unknown; // Decimal
    respondedAt: Date | null;
    declineReason: string | null;
    generatedById: string;
  } | null;
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

const ALLOWED_STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: [ApplicationStatus.SUBMITTED],
  SUBMITTED: [ApplicationStatus.UNDER_REVIEW, ApplicationStatus.NOT_SELECTED],
  UNDER_REVIEW: [ApplicationStatus.SHORTLISTED, ApplicationStatus.NOT_SELECTED],
  SHORTLISTED: [ApplicationStatus.NOT_SELECTED],
  INTERVIEW_SCHEDULED: [ApplicationStatus.NOT_SELECTED], // INTERVIEW_COMPLETED now only reachable via recordInterviewOutcome
  INTERVIEW_COMPLETED: [ApplicationStatus.NOT_SELECTED], // OFFER_EXTENDED now only reachable via generateOfferLetter
  OFFER_EXTENDED: [ApplicationStatus.NOT_SELECTED],
  EMPLOYED: [],
  NOT_SELECTED: [],
};

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
    private s3Service: S3Service,
    private qoreidService: QoreidService,

  ) { }

  private get applicationModel(): ApplicationModelDelegate {
    return (
      this.prisma as unknown as { application: ApplicationModelDelegate }
    ).application;
  }

  // Add near the top of the class, alongside your other private helpers:

  /**
   * Parses a user-supplied datetime string, refusing anything without an
   * explicit UTC offset. This is the root fix for the WAT/UTC drift bug:
   * a naive string like "2026-08-06T14:00" is ambiguous (interpreted as
   * local time of whatever process parses it), so we reject it outright
   * instead of silently misreading it. Callers must send "...Z" or
   * "...+01:00" — e.g. the output of `date.toISOString()` on the frontend.
   */
  private parseRequiredOffsetDateTime(value: string, fieldName: string): Date {
    const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
    if (!hasOffset) {
      throw new BadRequestException(
        `${fieldName} must be an ISO 8601 datetime with an explicit UTC offset (e.g. "...Z" or "...+01:00"), got "${value}".`,
      );
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} is not a valid datetime.`);
    }
    return parsed;
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

  /**
    * Answers a repeat verification attempt (same nin+firstName+lastName —
    * typically caused by a page refresh) from whatever's already stored,
    * rather than calling QoreID again. Also reuses a NIN that was verified
    * successfully on a PRIOR, different application (a returning applicant
    * applying for a new role) without re-verifying. Every attempt — success
    * or failure — gets persisted onto a DRAFT Application row so the next
    * attempt for the same inputs is free.
    */
  async verifyNinForApplication(nin: string, firstName: string, lastName: string) {
    const existingDraft = await this.applicationModel.findFirst({
      where: { nin, firstName, lastName, status: ApplicationStatus.DRAFT },
      orderBy: { createdAt: 'desc' },
    });

    if (existingDraft?.ninVerified) {
      return this.ninVerifyResponseFromRecord(existingDraft, true);
    }
    if (existingDraft?.ninVerificationFailReason) {
      return this.ninVerifyResponseFromRecord(existingDraft, false);
    }

    if (!existingDraft) {
      const anyVerifiedForNin = await this.applicationModel.findFirst({
        where: { nin, ninVerified: true },
        orderBy: { ninVerifiedAt: 'desc' },
      });

      if (anyVerifiedForNin) {
        const nameMatches =
          anyVerifiedForNin.firstName.trim().toLowerCase() === firstName.trim().toLowerCase() &&
          anyVerifiedForNin.lastName.trim().toLowerCase() === lastName.trim().toLowerCase();

        if (nameMatches) {
          const created = await this.createOrUpdateDraft(null, {
            nin,
            firstName,
            lastName,
            dateOfBirth: anyVerifiedForNin.dateOfBirth,
            gender: anyVerifiedForNin.gender,
            phone: anyVerifiedForNin.phone,
            address: anyVerifiedForNin.address,
            ninVerified: true,
            ninVerifiedAt: anyVerifiedForNin.ninVerifiedAt,
            ninPhotoUrl: anyVerifiedForNin.ninPhotoUrl,
            ninVerificationFailReason: null,
          });
          return this.ninVerifyResponseFromRecord(created, true);
        }

        // This NIN is already verified in our own records, just under a
        // different name -- QoreID would certainly reject this too, so
        // there's no reason to spend a real call finding that out. No
        // draft is created and no cooldown is touched here: this is a
        // free, local check, not a billable attempt.
        return {
          applicationId: null,
          verified: false,
          reason: 'NAME_MISMATCH',
          message: "We couldn't verify those details against this NIN. Double-check your first and last name match your NIN slip exactly, then try again.",
        };
      }
    }

    const cooldown = await this.checkAndRecordNinCooldown(nin);
    if (cooldown) {
      return {
        applicationId: existingDraft?.id ?? null,
        verified: false,
        reason: 'RATE_LIMITED',
        retryAfterSeconds: cooldown.retryAfterSeconds,
        message: `Maximum retries exceeded. Try again in ${this.formatRetryAfter(cooldown.retryAfterSeconds)}.`,
      };
    }

    try {
      const result = await this.qoreidService.verifyNin(nin, firstName, lastName);

      if (result.verified) {
        let photoKey: string | null = null;
        if (result.bio.photoBase64) {
          try {
            // Stored as an S3 key, not a URL — same pattern as cvUrl.
            // A presigned URL is generated on demand (see
            // ninVerifyResponseFromRecord / sanitize), never persisted.
            photoKey = await this.s3Service.uploadObject(
              Buffer.from(result.bio.photoBase64, 'base64'),
              'applications/nin-photos',
              `${nin}.jpg`,
              'image/jpeg',
            );
          } catch (err) {
            this.logger.warn(
              `Failed to upload NIN photo to S3: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        const record = await this.createOrUpdateDraft(existingDraft?.id ?? null, {
          nin,
          firstName,
          lastName,
          dateOfBirth: result.bio.dob || null,
          gender: result.bio.gender || null,
          phone: result.bio.phone || null,
          address: result.bio.address || null,
          ninVerified: true,
          ninVerifiedAt: new Date(),
          ninPhotoUrl: photoKey,
          ninVerificationFailReason: null,
        });
        return this.ninVerifyResponseFromRecord(record, true);
      }

      const record = await this.createOrUpdateDraft(existingDraft?.id ?? null, {
        nin,
        firstName,
        lastName,
        ninVerified: false,
        ninVerificationFailReason: result.reason,
      });
      return this.ninVerifyResponseFromRecord(record, false);
    } catch (err) {
      // QoreID itself errored (NIN not found, service unavailable, etc). This
      // is billed the same as a completed-but-unverified attempt, so it gets
      // cached the same way -- a repeat of the exact same bad input won't
      // charge again.
      const reason = err instanceof QoreidRequestError && err.status === 404 ? 'NIN_NOT_FOUND' : 'VERIFICATION_UNAVAILABLE';

      const record = await this.createOrUpdateDraft(existingDraft?.id ?? null, {
        nin,
        firstName,
        lastName,
        ninVerified: false,
        ninVerificationFailReason: reason,
      });
      return this.ninVerifyResponseFromRecord(record, false);
    }
  }

  /**
   * Per-NIN cooldown, separate from the cache-hit logic above — this only
   * fires for attempts that are actually about to reach QoreID (a cache-hit
   * never gets here), so it protects against rapid different-name guessing
   * against the same NIN without penalizing the legitimate "refresh the
   * page" case, which is answered for free before this is even called.
   * Returns null when the attempt is allowed (and records it), or the
   * remaining wait time when it's still on cooldown.
   */
  private async checkAndRecordNinCooldown(nin: string): Promise<{ retryAfterSeconds: number } | null> {
    const cooldownMinutes = Number(this.configService.get<string>('NIN_VERIFY_COOLDOWN_MINUTES')) || 5;
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const now = new Date();

    const existing = await this.prisma.ninVerificationAttempt.findUnique({ where: { nin } });
    if (existing) {
      const elapsedMs = now.getTime() - existing.lastAttemptAt.getTime();
      if (elapsedMs < cooldownMs) {
        return { retryAfterSeconds: Math.ceil((cooldownMs - elapsedMs) / 1000) };
      }
    }

    await this.prisma.ninVerificationAttempt.upsert({
      where: { nin },
      create: { nin, lastAttemptAt: now },
      update: { lastAttemptAt: now },
    });
    return null;
  }

  private formatRetryAfter(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0 && seconds > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} second${seconds === 1 ? '' : 's'}`;
    if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  private async createOrUpdateDraft(
    existingId: string | null,
    fields: {
      nin: string;
      firstName: string;
      lastName: string;
      dateOfBirth?: string | null;
      gender?: string | null;
      phone?: string | null;
      address?: string | null;
      ninVerified: boolean;
      ninVerifiedAt?: Date | null;
      ninPhotoUrl?: string | null;
      ninVerificationFailReason?: string | null;
    },
  ): Promise<ApplicationRecord> {
    if (existingId) {
      return this.applicationModel.update({ where: { id: existingId }, data: fields });
    }

    const applicationCode = await this.generateApplicationCode();
    return this.applicationModel.create({
      data: { applicationCode, status: ApplicationStatus.DRAFT, ...fields },
    });
  }

  /**
   * ninPhotoUrl on the record is an S3 object key (not a browsable URL —
   * same convention as cvUrl elsewhere in this service), so it's resolved
   * into a short-lived presigned URL right before handing it back to the
   * applicant.
   */
  private async ninVerifyResponseFromRecord(record: ApplicationRecord, verified: boolean) {
    if (verified) {
      let photoUrl: string | null = null;
      if (record.ninPhotoUrl) {
        try {
          photoUrl = await this.s3Service.getPresignedUrl(record.ninPhotoUrl);
        } catch (err) {
          this.logger.warn(
            `Failed to presign NIN photo for application ${record.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return {
        applicationId: record.id,
        verified: true,
        bio: {
          dob: record.dateOfBirth || '',
          gender: record.gender || '',
          phone: record.phone || '',
          address: record.address || '',
        },
        photoUrl,
      };
    }
    return {
      applicationId: record.id,
      verified: false,
      reason: record.ninVerificationFailReason || 'VERIFICATION_UNAVAILABLE',
    };
  }

  async submit(dto: CreateApplicationDto) {
    const existing = await this.applicationModel.findFirst({
      where: {
        nin: dto.nin,
        status: { notIn: [ApplicationStatus.NOT_SELECTED, ApplicationStatus.DRAFT] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, appliedRole: true },
    });

    if (existing) {
      throw new ConflictException(
        existing.status === ApplicationStatus.EMPLOYED
          ? 'You have already been hired.'
          : `You already have an active application${existing.appliedRole ? ` for ${existing.appliedRole}` : ''}. Only one active application is allowed at a time — check your applicant dashboard for its status, or apply again once a decision has been made.`,
      );
    }


    // If this submission is finishing a draft created during NIN
    // verification, reuse that same record (and its applicationCode)
    // rather than creating a second one — the nin must still match, so a
    // draftId from a different NIN can't be reused for this submission.
    const draft = dto.applicationId
      ? await this.applicationModel.findFirst({
        where: { id: dto.applicationId, status: ApplicationStatus.DRAFT, nin: dto.nin },
      })
      : null;

    const applicationCode = draft ? draft.applicationCode : await this.generateApplicationCode();
    const { otp, otpHash, otpExpiresAt } = await this.generateOtp();

    const data = {
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
    };

    const application = draft
      ? await this.applicationModel.update({ where: { id: draft.id }, data })
      : await this.applicationModel.create({ data });

    const dashboardUrl =
      this.configService.get<string>('APPLICANT_DASHBOARD_URL') ||
      'https://hairlux.com.ng/login.html';

    this.mailService.sendApplicationConfirmationEmail(application.email!, application.firstName, {
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
    console.log('[trace][requestOtp] called with', { applicationCode, email });

    const application = await this.applicationModel.findFirst({
      where: { applicationCode },
    });

    console.log('[trace][requestOtp] lookup result:', application
      ? { id: application.id, storedEmail: application.email }
      : 'NO APPLICATION FOUND for that applicationCode');

    // Same response whether the code doesn't exist or the email doesn't
    // match — don't let this endpoint be used to probe which application
    // codes are real or confirm an applicant's email address.
    if (!application || !application.email || application.email.toLowerCase() !== email.toLowerCase()) {
      console.log('[trace][requestOtp] SILENTLY RETURNING — no match. application exists:', !!application,
        application ? `stored email "${application.email}" vs supplied "${email}"` : '');
      return; // controller returns a generic success message regardless
    }

    const { otp, otpHash, otpExpiresAt } = await this.generateOtp();
    console.log('[trace][requestOtp] OTP generated, expires at', otpExpiresAt);

    await this.applicationModel.update({
      where: { id: application.id },
      data: { otpHash, otpExpiresAt },
    });
    console.log('[trace][requestOtp] otpHash saved to application record');

    await this.mailService.sendApplicationOtpEmail(application.email, application.firstName, {
      applicationCode: application.applicationCode,
      otp,
      dashboardUrl:
        this.configService.get<string>('APPLICANT_DASHBOARD_URL') ||
        'https://hairlux.com.ng/login.html',
    });
    console.log('[trace][requestOtp] sendApplicationOtpEmail call completed (queued — check mail queue/processor logs for actual delivery)');
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

    await this.applicationModel.update({
      where: { id: application.id },
      data: { otpHash: null, otpExpiresAt: null },
    });

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

  async findAllForAdmin(queryDto: QueryApplicationDto) {
    const cacheKey = `application:list:admin:${JSON.stringify(queryDto)}`;
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

    // Admins never see DRAFT applications — those are abandoned/incomplete
    // NIN-verification records, not real submissions. If a status filter is
    // explicitly supplied we respect it as given; otherwise we exclude DRAFT
    // by default.
    const where: Record<string, unknown> = status
      ? { status }
      : { status: { not: ApplicationStatus.DRAFT } };

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
      include: {
        interviewLocation: { select: { id: true, name: true } },
        offerLetter: true,
        employmentApproval: true,
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const sanitized = await this.sanitize(application);
    await this.redis.set(cacheKey, sanitized, TTL);
    return sanitized;
  }

  /**
     * Basic recruitment report per the original brief: applicants per role,
     * status breakdown, and average time-to-hire. Aggregated in JS rather
     * than a Prisma groupBy -- application volumes here are small enough
     * that this is simpler than adding groupBy typing to the model delegate,
     * and keeps this consistent with the "basic" scope the brief asked for.
     */
  async getRecruitmentReport() {
    const applications = await this.applicationModel.findMany({
      select: {
        appliedRole: true,
        status: true,
        createdAt: true,
        employedAt: true,
      } as unknown as QueryArgs,
    });

    const byRoleMap = new Map<string, number>();
    const byStatusMap = new Map<string, number>();
    const hireDurationsDays: number[] = [];

    for (const app of applications as unknown as Array<{
      appliedRole: string | null;
      status: string;
      createdAt: Date;
      employedAt: Date | null;
    }>) {
      const role = app.appliedRole || 'Unspecified';
      byRoleMap.set(role, (byRoleMap.get(role) ?? 0) + 1);
      byStatusMap.set(app.status, (byStatusMap.get(app.status) ?? 0) + 1);

      if (app.status === 'EMPLOYED' && app.employedAt) {
        const days = (new Date(app.employedAt).getTime() - new Date(app.createdAt).getTime()) / 86400000;
        if (days >= 0) hireDurationsDays.push(days);
      }
    }

    const averageTimeToHireDays = hireDurationsDays.length
      ? Math.round((hireDurationsDays.reduce((a, b) => a + b, 0) / hireDurationsDays.length) * 10) / 10
      : null;

    return {
      totalApplications: applications.length,
      byRole: Array.from(byRoleMap.entries())
        .map(([role, count]) => ({ role, count }))
        .sort((a, b) => b.count - a.count),
      byStatus: Array.from(byStatusMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      averageTimeToHireDays,
      hiredCount: hireDurationsDays.length,
    };
  }

  private async sanitize(application: ApplicationRecord) {
    const { otpHash, otpExpiresAt, cvUrl, ninPhotoUrl, interviewLocation, ...rest } = application;
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

    let ninPhotoDownloadUrl: string | null = null;
    if (ninPhotoUrl) {
      try {
        ninPhotoDownloadUrl = await this.s3Service.getPresignedUrl(ninPhotoUrl);
      } catch {
        ninPhotoDownloadUrl = null;
      }
    }

    return {
      ...rest,
      cvDownloadUrl,
      ninPhotoDownloadUrl,
      interviewLocationName: interviewLocation?.name ?? null,
    };
  }

  async updateStatus(id: string, dto: UpdateApplicationStatusDto) {
    const existing = await this.applicationModel.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Application not found');
    }

    if (dto.status === ApplicationStatus.EMPLOYED) {
      throw new BadRequestException('Use POST /admin/applications/:id/convert-to-staff to mark an applicant as employed');
    }

    const allowedNext = ALLOWED_STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        allowedNext.length
          ? `Cannot move from ${existing.status} to ${dto.status}. Valid next status(es): ${allowedNext.join(', ')}.`
          : `${existing.status} is a terminal status — no further transitions are allowed.`,
      );
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
      .sendApplicationStatusUpdateEmail(application.email!, application.firstName, status, {
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

    const canSchedule =
      existing.status === ApplicationStatus.SHORTLISTED ||
      existing.status === ApplicationStatus.INTERVIEW_SCHEDULED;

    if (!canSchedule) {
      throw new BadRequestException(
        `Cannot schedule an interview from status ${existing.status}. The application must be SHORTLISTED first.`,
      );
    }

    const scheduledAt = this.parseRequiredOffsetDateTime(dto.scheduledAt, 'scheduledAt');

    const updated = await this.applicationModel.update({
      where: { id },
      data: {
        status: ApplicationStatus.INTERVIEW_SCHEDULED,
        interviewScheduledAt: new Date(scheduledAt),
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

      await this.mailService.sendInterviewScheduledEmail(application.email!, application.firstName, {
        applicationCode: application.applicationCode,
        scheduledAt: this.parseRequiredOffsetDateTime(dto.scheduledAt, 'scheduledAt'),
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

  async recordInterviewOutcome(
    applicationId: string,
    dto: RecordInterviewOutcomeDto,
    actorUserId: string,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.status !== ApplicationStatus.INTERVIEW_SCHEDULED) {
      throw new BadRequestException(
        `Cannot record interview outcome — application is at ${application.status}, expected INTERVIEW_SCHEDULED`,
      );
    }

    const interviewer = await this.prisma.staff.findUnique({
      where: { id: dto.interviewerId },
    });

    if (!interviewer) {
      throw new NotFoundException('Interviewer (staff) not found');
    }

    // PASS routes to INTERVIEW_COMPLETED for further pipeline progression (Employment Approval next).
    // FAIL routes straight to NOT_SELECTED. HOLD keeps status at INTERVIEW_SCHEDULED for a later re-decision.
    const nextStatus =
      dto.outcome === InterviewOutcome.FAIL
        ? ApplicationStatus.NOT_SELECTED
        : dto.outcome === InterviewOutcome.HOLD
          ? application.status // no status change on HOLD
          : ApplicationStatus.INTERVIEW_COMPLETED;

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        interviewOutcome: dto.outcome,
        interviewerId: dto.interviewerId,
        interviewNote: dto.note ?? application.interviewNote,
        status: nextStatus,
        ...(dto.outcome === InterviewOutcome.FAIL
          ? { notSelectedReason: dto.note ?? 'Did not pass interview' }
          : {}),
      },
    });

    // TODO once Audit Trail module exists: log actorUserId, applicationId, previous/new status+outcome here.

    return updated;
  }

  async recordEmploymentApproval(
    applicationId: string,
    dto: ApproveEmploymentDto,
    approvedById: string,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { employmentApproval: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.interviewOutcome !== InterviewOutcome.PASS) {
      throw new BadRequestException(
        'Cannot record employment approval — candidate has not passed interview',
      );
    }

    if (application.employmentApproval) {
      throw new BadRequestException('Employment approval already recorded for this candidate');
    }

    const approval = await this.prisma.employmentApproval.create({
      data: {
        applicationId,
        approvedById,
        notes: dto.notes,
      },
    });

    await this.invalidateCache(applicationId);

    return approval;
  }

  async generateOfferLetter(
    applicationId: string,
    dto: GenerateOfferLetterDto,
    generatedById: string,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { employmentApproval: true, offerLetter: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (!application.employmentApproval) {
      throw new BadRequestException(
        'Cannot generate offer letter — employment approval is required first',
      );
    }

    if (application.offerLetter) {
      throw new BadRequestException('An offer letter has already been generated for this candidate');
    }

    const jobPosting = application.jobId
      ? await this.prisma.jobPosting.findUnique({ where: { id: application.jobId } })
      : null;

    if (jobPosting?.salaryMax && dto.baseSalary > Number(jobPosting.salaryMax)) {
      // TODO: tiered approval — see the earlier note on this from Employment Approval.
    }

    const [offerLetter] = await this.prisma.$transaction([
      this.prisma.offerLetter.create({
        data: {
          applicationId,
          jobPostingId: application.jobId,
          role: application.appliedRole ?? jobPosting?.title ?? 'Unspecified',
          branchId: jobPosting?.branchId,
          baseSalary: dto.baseSalary,
          allowances: dto.allowances,
          compensationNote: dto.compensationNote,
          effectiveDate: this.parseRequiredOffsetDateTime(dto.effectiveDate, 'effectiveDate'),
          templateUsed: dto.templateUsed,
          generatedById,
          sentAt: new Date(),
        },
      }),
      this.prisma.application.update({
        where: { id: applicationId },
        data: { status: ApplicationStatus.OFFER_EXTENDED },
      }),
    ]);

    await this.invalidateCache(applicationId);

    const dashboardUrl =
      this.configService.get<string>('APPLICANT_DASHBOARD_URL') ||
      'https://hairlux.com.ng/login.html';

    this.mailService
      .sendOfferExtendedEmail(application.email!, application.firstName, {
        applicationCode: application.applicationCode,
        role: offerLetter.role,
        baseSalary: Number(offerLetter.baseSalary),
        allowances: offerLetter.allowances ? Number(offerLetter.allowances) : undefined,
        effectiveDate: offerLetter.effectiveDate,
        dashboardUrl,
      })
      .catch((err) => {
        this.logger.error(`Failed to queue offer-extended email for ${application.email}: ${err instanceof Error ? err.message : String(err)}`);
      });

    return offerLetter;
  }

  async respondToOffer(applicationId: string, dto: RespondToOfferDto) {
    const application = await this.applicationModel.findUnique({
      where: { id: applicationId },
      include: { offerLetter: true },
    });

    if (!application?.offerLetter) {
      throw new NotFoundException('No offer letter found for this application');
    }

    if (application.offerLetter.status !== OfferLetterStatus.SENT) {
      throw new BadRequestException(
        `Cannot respond — offer is already ${application.offerLetter.status}`,
      );
    }

    const isDecline = dto.response === OfferResponseAction.DECLINE;

    const [updatedOffer] = await this.prisma.$transaction([
      this.prisma.offerLetter.update({
        where: { applicationId },
        data: {
          status: isDecline ? OfferLetterStatus.DECLINED : OfferLetterStatus.ACCEPTED,
          respondedAt: new Date(),
          declineReason: isDecline ? dto.declineReason : null,
        },
      }),
      ...(isDecline
        ? [
          this.prisma.application.update({
            where: { id: applicationId },
            data: {
              status: ApplicationStatus.NOT_SELECTED,
              notSelectedReason: 'Declined offer',
            },
          }),
        ]
        : []),
    ]);

    await this.invalidateCache(applicationId);
    if (isDecline) {
      this.notifyOfferDeclined(application.id, application.offerLetter.generatedById, application.jobId);
    }

    return updatedOffer;
  }

  /**
   * Fires two things on decline: an email to whoever generated the offer,
   * and — only if this was the posting's last active candidate — a follow-up
   * note flagging the posting as effectively empty. No Notification Center
   * exists yet, so this is plain email, matching the pattern used elsewhere
   * in this service (sendApplicationStatusUpdateEmail, etc.).
   */
  private async notifyOfferDeclined(applicationId: string, generatedById: string, jobId: string | null) {
    const [application, generatedBy] = await Promise.all([
      this.applicationModel.findUnique({ where: { id: applicationId } }),
      this.prisma.user.findUnique({ where: { id: generatedById } }),
    ]);

    if (!application || !generatedBy) return;

    let postingNowEmpty = false;
    if (jobId) {
      const remainingActive = await this.applicationModel.count({
        where: {
          jobId,
          status: { notIn: [ApplicationStatus.EMPLOYED, ApplicationStatus.NOT_SELECTED] },
        },
      });
      postingNowEmpty = remainingActive === 0;
    }

    this.mailService
      .sendOfferDeclinedEmail(generatedBy.email, generatedBy.firstName, {
        candidateName: `${application.firstName} ${application.lastName}`,
        applicationCode: application.applicationCode,
        declineReason: application.notSelectedReason ?? undefined,
        postingNowEmpty,
      })
      .catch((err) => {
        this.logger.error(`Failed to queue offer-declined email for ${generatedBy.email}: ${err instanceof Error ? err.message : String(err)}`);
      });
  }
  /**
   * Converts a hired applicant into a staff record, reusing StaffService so
   * staff codes, opening employment history, and duplicate-email checks all
   * happen exactly the same way as a manually-created staff record.
   */
  async convertToStaff(id: string, locationId: string, actingAdminId?: string) {
    const application = await this.applicationModel.findUnique({
      where: { id },
      include: { employmentApproval: true, offerLetter: true } as unknown as QueryArgs,
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    if (application.status === ApplicationStatus.EMPLOYED) {
      throw new ConflictException('This application has already been converted to a staff record');
    }
    if (!application.employmentApproval) {
      throw new BadRequestException('Cannot convert to staff — employment approval has not been recorded');
    }
    if (application.offerLetter?.status !== 'ACCEPTED') {
      throw new BadRequestException('Cannot convert to staff — no accepted offer letter on record');
    }

    // NIN-based duplicate-staff check -- the email/User-based check further
    // below only catches a match if this applicant's email happens to match
    // an existing account. It completely misses the same real person applying
    // under a DIFFERENT email with the SAME NIN. Block if that person already
    // has an active-ish staff record; just warn (don't block) if the only
    // match is a former employee who exited, since that's a legitimate
    // rehire, not a data error, and shouldn't be silently blocked.
    let rehireWarning: string | undefined;
    const otherApplicationsWithSameNin = await this.applicationModel.findMany({
      where: {
        nin: application.nin,
        staffId: { not: null },
        id: { not: application.id },
      } as unknown as QueryArgs,
    });
    for (const other of otherApplicationsWithSameNin as unknown as Array<{ staffId: string | null }>) {
      if (!other.staffId) continue;
      const existingStaff = await this.staffService.findOne(other.staffId).catch(() => null);
      if (!existingStaff) continue;
      const status = (existingStaff as unknown as { employmentStatus?: string }).employmentStatus;
      const staffCode = (existingStaff as unknown as { staffCode?: string }).staffCode;
      if (status && !['EXITED', 'ARCHIVED'].includes(status)) {
        throw new ConflictException(
          `This NIN is already linked to an active staff record (${staffCode}). Cannot create a duplicate staff record for the same person.`,
        );
      }
      if (staffCode) {
        rehireWarning = `This person appears to be a returning employee (previously ${staffCode}, now ${(status ?? 'unknown').toLowerCase()}). A new staff record is being created rather than reactivating the old one -- review manually if this should instead be a rehire.`;
      }
    }

    const fullName = [application.firstName, application.middleName, application.lastName]
      .filter(Boolean).join(' ');

    // Application.dateOfBirth is a free-text string (sourced from NIN lookup
    // at application time) -- Staff.dateOfBirth requires a clean ISO date.
    // Parse defensively: a malformed source string should skip this one
    // field, not block the entire hire.
    let staffDateOfBirth: string | undefined;
    if (application.dateOfBirth) {
      const parsed = new Date(application.dateOfBirth);
      if (!Number.isNaN(parsed.getTime())) {
        staffDateOfBirth = parsed.toISOString().slice(0, 10);
      } else {
        this.logger.warn(
          `convertToStaff: could not parse dateOfBirth "${application.dateOfBirth}" for application ${application.applicationCode} -- left blank on the new Staff record.`,
        );
      }
    }

    // ── Resolve or create the User account ──
    // Prefer the customer (USER) account when the person holds both a USER and
    // a BEAUTICIAN account for this email; fall back to whichever account
    // exists so a beautician-only applicant is still handled.
    let user =
      (await this.prisma.user.findFirst({
        where: { email: application.email!, role: 'USER' },
      })) ??
      (await this.prisma.user.findFirst({ where: { email: application.email! } }));

    if (user) {
      const existingStaff = await this.prisma.staff.findUnique({ where: { userId: user.id } });
      if (existingStaff) {
        throw new ConflictException(
          `This person is already a staff member (${existingStaff.staffCode}). Cannot create a duplicate staff record.`,
        );
      }
    }

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
          email: application.email!,
          password: hashedPassword,
          firstName: application.firstName,
          lastName: application.lastName,
          phone: application.phone!,
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
      email: application.email ?? undefined,
      phone: application.phone ?? undefined,
      dateOfBirth: staffDateOfBirth,
      address: application.address ?? undefined,
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
    return rehireWarning ? { ...staff, rehireWarning } : staff;
  }
}