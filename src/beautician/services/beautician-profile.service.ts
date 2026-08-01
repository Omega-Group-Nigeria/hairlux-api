import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, ProfileReviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { R2Service } from '../../storage/r2.service';
import { UpdateBeauticianProfileDto } from '../dto/update-beautician-profile.dto';
import { ProfileRejectScope } from '../dto/admin-beautician.dto';
import { BeauticianNotificationService } from '../notification/services/beautician-notification.service';
import { OnboardingPushNotifier } from '../../notifications/onboarding/onboarding-push.notifier';
import { serializeBeauticianProfile } from '../utils/beautician-profile.utils';
import { BeauticianMeCacheService } from './beautician-me-cache.service';

@Injectable()
export class BeauticianProfileService {
  private readonly logger = new Logger(BeauticianProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly notificationService: BeauticianNotificationService,
    private readonly meCache: BeauticianMeCacheService,
    private readonly r2: R2Service,
    private readonly onboardingPushNotifier: OnboardingPushNotifier,
  ) {}

  async updateProfile(userId: string, dto: UpdateBeauticianProfileDto) {
    const profile = await this.requireProfile(userId);
    this.assertProfileEditable(profile);

    const updateData: Prisma.BeauticianProfileUpdateInput = {
      ...(dto.bio !== undefined && { bio: dto.bio }),
      ...(dto.specialties !== undefined && { specialties: dto.specialties }),
      ...(dto.yearsOfExperience !== undefined && {
        yearsOfExperience: dto.yearsOfExperience,
      }),
      ...(dto.certifications !== undefined && {
        certifications: dto.certifications,
      }),
    };

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    await this.meCache.invalidate(userId);

    return serializeBeauticianProfile(updated);
  }

  async uploadCertification(userId: string, file: Express.Multer.File) {
    const profile = await this.requireProfile(userId);
    this.assertProfileEditable(profile);

    const upload = await this.cloudinaryService.uploadImage(
      file.buffer,
      'beauticians/certifications',
    );

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: {
        certifications: [...profile.certifications, upload.secureUrl],
      },
    });

    await this.meCache.invalidate(userId);

    return {
      certifications: updated.certifications,
      uploadedUrl: upload.secureUrl,
    };
  }

  async submitForReview(userId: string) {
    const profile = await this.requireProfile(userId);
    this.assertProfileEditable(profile);
    this.assertProfileComplete(profile);

    // Conditional write: only from editable statuses (blocks double-submit races)
    const moved = await this.prisma.beauticianProfile.updateMany({
      where: {
        userId,
        kycStatus: KycStatus.VERIFIED,
        profileStatus: {
          in: [
            ProfileReviewStatus.NOT_SUBMITTED,
            ProfileReviewStatus.REJECTED,
          ],
        },
      },
      data: {
        profileStatus: ProfileReviewStatus.AWAITING_VIDEO,
        profileSubmittedAt: new Date(),
        reviewNotes: null,
        kycVideoKey: null,
      },
    });

    if (moved.count !== 1) {
      throw new ConflictException(
        'Profile can no longer be submitted in its current state. Refresh status and try again.',
      );
    }

    const updated = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: {
        profileStatus: true,
        profileSubmittedAt: true,
      },
    });

    if (!updated) {
      throw new NotFoundException('Beautician profile not found');
    }

    await this.meCache.invalidate(userId);

    return {
      profileStatus: updated.profileStatus,
      profileSubmittedAt: updated.profileSubmittedAt,
      nextStep: 'VIDEO_SUBMISSION' as const,
      message:
        'Profile details submitted. Record your 1-minute intro video to complete verification and enter admin review.',
    };
  }

  async getReviewStatus(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: {
        profileStatus: true,
        profileSubmittedAt: true,
        profileReviewedAt: true,
        profileReviewedById: true,
        reviewNotes: true,
        kycVideoKey: true,
        updatedAt: true,
        profileReviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }

    const { kycVideoKey, ...rest } = profile;

    return {
      ...rest,
      hasKycVideo: Boolean(kycVideoKey),
      nextStep:
        profile.profileStatus === ProfileReviewStatus.AWAITING_VIDEO
          ? ('VIDEO_SUBMISSION' as const)
          : profile.profileStatus === ProfileReviewStatus.NOT_SUBMITTED ||
              profile.profileStatus === ProfileReviewStatus.REJECTED
            ? ('PROFILE_SUBMISSION' as const)
            : profile.profileStatus === ProfileReviewStatus.PENDING_REVIEW
              ? ('AWAITING_ADMIN_REVIEW' as const)
              : ('NONE' as const),
    };
  }

  async approveProfile(
    profileId: string,
    adminUserId: string,
    notes?: string,
  ) {
    const profile = await this.requireProfileById(profileId);

    if (profile.profileStatus !== ProfileReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Only profiles pending review can be approved',
      );
    }

    if (profile.kycStatus !== KycStatus.VERIFIED) {
      throw new BadRequestException('KYC must be verified before profile approval');
    }

    const moved = await this.prisma.beauticianProfile.updateMany({
      where: {
        id: profileId,
        kycStatus: KycStatus.VERIFIED,
        profileStatus: ProfileReviewStatus.PENDING_REVIEW,
      },
      data: {
        profileStatus: ProfileReviewStatus.APPROVED,
        profileReviewedAt: new Date(),
        profileReviewedById: adminUserId,
        reviewNotes: notes ?? null,
      },
    });

    if (moved.count !== 1) {
      throw new ConflictException(
        'Profile is no longer pending review. Refresh and try again.',
      );
    }

    const updated = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!updated) {
      throw new NotFoundException('Beautician profile not found');
    }

    await this.notificationService.notifyProfileReviewResult(
      updated.user,
      'APPROVED',
      notes,
    );
    this.onboardingPushNotifier.notifyProfileReview({
      beauticianUserId: updated.userId,
      outcome: 'APPROVED',
      notes,
    });

    return serializeBeauticianProfile(updated);
  }

  async rejectProfile(
    profileId: string,
    adminUserId: string,
    reason: string,
    notes?: string,
    scope: ProfileRejectScope = ProfileRejectScope.FULL,
  ) {
    const profile = await this.requireProfileById(profileId);

    if (profile.profileStatus !== ProfileReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Only profiles pending review can be rejected',
      );
    }

    const combinedNotes = notes ? `${reason}\n\n${notes}` : reason;
    const isVideoOnly = scope === ProfileRejectScope.VIDEO_ONLY;
    const previousVideoKey = profile.kycVideoKey;

    const moved = await this.prisma.beauticianProfile.updateMany({
      where: {
        id: profileId,
        profileStatus: ProfileReviewStatus.PENDING_REVIEW,
      },
      data: {
        profileStatus: isVideoOnly
          ? ProfileReviewStatus.AWAITING_VIDEO
          : ProfileReviewStatus.REJECTED,
        profileReviewedAt: new Date(),
        profileReviewedById: adminUserId,
        reviewNotes: combinedNotes,
        kycVideoKey: null,
      },
    });

    if (moved.count !== 1) {
      throw new ConflictException(
        'Profile is no longer pending review. Refresh and try again.',
      );
    }

    // Remove rejected submission from R2 (FULL and VIDEO_ONLY both clear video)
    if (previousVideoKey) {
      await this.r2.deleteObject(previousVideoKey);
      this.logger.log(
        `Deleted KYC video from R2 after profile reject (${scope}): ${previousVideoKey}`,
      );
    }

    const updated = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!updated) {
      throw new NotFoundException('Beautician profile not found');
    }

    await this.meCache.invalidate(updated.userId);

    const reviewOutcome = isVideoOnly ? 'VIDEO_ONLY' : 'REJECTED';
    await this.notificationService.notifyProfileReviewResult(
      updated.user,
      reviewOutcome,
      combinedNotes,
    );
    this.onboardingPushNotifier.notifyProfileReview({
      beauticianUserId: updated.userId,
      outcome: reviewOutcome,
      notes: combinedNotes,
    });

    return serializeBeauticianProfile(updated);
  }

  private assertProfileEditable(profile: {
    kycStatus: KycStatus;
    profileStatus: ProfileReviewStatus;
  }) {
    if (profile.kycStatus !== KycStatus.VERIFIED) {
      throw new ForbiddenException(
        'Complete KYC verification before updating your professional profile',
      );
    }

    if (profile.profileStatus === ProfileReviewStatus.AWAITING_VIDEO) {
      throw new ForbiddenException(
        'Profile is locked while awaiting video submission. Complete the video step, or contact support.',
      );
    }

    if (profile.profileStatus === ProfileReviewStatus.PENDING_REVIEW) {
      throw new ForbiddenException(
        'Profile is locked while pending admin review',
      );
    }

    if (profile.profileStatus === ProfileReviewStatus.APPROVED) {
      throw new ForbiddenException(
        'Approved profiles cannot be edited via self-service in this version',
      );
    }
  }

  private assertProfileComplete(profile: {
    bio: string | null;
    profilePhotoUrl: string | null;
    specialties: string[];
    yearsOfExperience: number | null;
  }) {
    const missing: string[] = [];

    if (!profile.bio?.trim()) missing.push('bio');
    if (!profile.profilePhotoUrl) missing.push('profilePhotoUrl');
    if (!profile.specialties?.length) missing.push('specialties');
    if (profile.yearsOfExperience == null) missing.push('yearsOfExperience');

    if (missing.length > 0) {
      throw new BadRequestException(
        `Profile is incomplete. Missing required fields: ${missing.join(', ')}`,
      );
    }
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Beautician profile not found');
    return profile;
  }

  private async requireProfileById(profileId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Beautician profile not found');
    return profile;
  }
}