import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, ProfileReviewStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { R2Service } from '../../../storage/r2.service';
import {
  KYC_VIDEO_ALLOWED_CONTENT_TYPES,
  KYC_VIDEO_MAX_SIZE_BYTES,
  type KycVideoContentType,
} from '../../../storage/r2.constants';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { BeauticianMeCacheService } from '../../services/beautician-me-cache.service';
import { RequestKycVideoUploadDto } from '../dto/request-kyc-video-upload.dto';
import { ConfirmKycVideoUploadDto } from '../dto/confirm-kyc-video-upload.dto';

@Injectable()
export class KycVideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly notificationService: BeauticianNotificationService,
    private readonly meCache: BeauticianMeCacheService,
  ) {}

  async requestUpload(userId: string, dto: RequestKycVideoUploadDto) {
    const profile = await this.requireProfile(userId);
    this.assertCanSubmitVideo(profile);

    if (
      dto.fileSizeBytes != null &&
      dto.fileSizeBytes > KYC_VIDEO_MAX_SIZE_BYTES
    ) {
      throw new BadRequestException(
        `Video exceeds maximum size of ${KYC_VIDEO_MAX_SIZE_BYTES} bytes (15 MB)`,
      );
    }

    const contentType = dto.contentType as KycVideoContentType;
    if (!KYC_VIDEO_ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException(
        `Unsupported content type. Allowed: ${KYC_VIDEO_ALLOWED_CONTENT_TYPES.join(', ')}`,
      );
    }

    const fileKey = this.r2.buildKycVideoKey(userId, contentType);
    const presigned = await this.r2.createPresignedUploadUrl(
      fileKey,
      contentType,
      KYC_VIDEO_MAX_SIZE_BYTES,
    );

    return {
      ...presigned,
      instructions:
        'Upload the compressed video with HTTP PUT to uploadUrl. Include Content-Type header matching contentType. Then call confirm-upload with fileKey.',
    };
  }

  async confirmUpload(userId: string, dto: ConfirmKycVideoUploadDto) {
    const profile = await this.requireProfile(userId);
    this.assertCanSubmitVideo(profile);

    if (!this.r2.isOwnedKycVideoKey(userId, dto.fileKey)) {
      throw new BadRequestException('Invalid file key for this account');
    }

    const contentType = dto.contentType as KycVideoContentType;
    if (!KYC_VIDEO_ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException(
        `Unsupported content type. Allowed: ${KYC_VIDEO_ALLOWED_CONTENT_TYPES.join(', ')}`,
      );
    }

    const head = await this.r2.headObject(dto.fileKey);

    if (!head.contentLength || head.contentLength <= 0) {
      throw new BadRequestException(
        'Uploaded video is empty or missing. Please re-upload.',
      );
    }

    if (head.contentLength > KYC_VIDEO_MAX_SIZE_BYTES) {
      throw new BadRequestException(
        `Video exceeds maximum size of ${KYC_VIDEO_MAX_SIZE_BYTES} bytes (15 MB)`,
      );
    }

    if (
      dto.fileSizeBytes != null &&
      Math.abs(dto.fileSizeBytes - head.contentLength) > 1024
    ) {
      throw new BadRequestException(
        'Reported file size does not match the uploaded object',
      );
    }

    const objectContentType = head.contentType?.toLowerCase().split(';')[0];
    if (
      objectContentType &&
      !KYC_VIDEO_ALLOWED_CONTENT_TYPES.includes(
        objectContentType as KycVideoContentType,
      )
    ) {
      throw new BadRequestException(
        `Uploaded object has unsupported Content-Type: ${head.contentType}`,
      );
    }

    const now = new Date();

    // Conditional write: only one concurrent confirm can win AWAITING_VIDEO → PENDING_REVIEW
    const moved = await this.prisma.beauticianProfile.updateMany({
      where: {
        userId,
        kycStatus: KycStatus.VERIFIED,
        profileStatus: ProfileReviewStatus.AWAITING_VIDEO,
      },
      data: {
        kycVideoKey: dto.fileKey,
        profileStatus: ProfileReviewStatus.PENDING_REVIEW,
        profileSubmittedAt: profile.profileSubmittedAt ?? now,
        reviewNotes: null,
      },
    });

    if (moved.count !== 1) {
      throw new ConflictException(
        'Profile is no longer awaiting video submission. Refresh status and try again.',
      );
    }

    const updated = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!updated) {
      throw new NotFoundException('Beautician profile not found');
    }

    await this.meCache.invalidate(userId);
    await this.notificationService.notifyProfileSubmitted(updated.user);

    return {
      profileStatus: updated.profileStatus,
      profileSubmittedAt: updated.profileSubmittedAt,
      hasKycVideo: true,
      updatedAt: updated.updatedAt,
      contentType: head.contentType ?? contentType,
      sizeBytes: head.contentLength,
      message:
        'Video submitted successfully. Your profile and video are now under admin review.',
    };
  }

  async getVideoPlaybackUrl(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: {
        kycVideoKey: true,
        updatedAt: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }

    if (!profile.kycVideoKey) {
      throw new NotFoundException('No KYC video has been submitted yet');
    }

    const [download, head] = await Promise.all([
      this.r2.createPresignedDownloadUrl(profile.kycVideoKey),
      this.r2.headObject(profile.kycVideoKey),
    ]);

    return {
      ...download,
      contentType: head.contentType ?? null,
      sizeBytes: head.contentLength,
      updatedAt: profile.updatedAt,
    };
  }

  private assertCanSubmitVideo(profile: {
    kycStatus: KycStatus;
    profileStatus: ProfileReviewStatus;
  }) {
    if (profile.kycStatus !== KycStatus.VERIFIED) {
      throw new ForbiddenException(
        'Complete KYC (QoreID) verification before submitting a video',
      );
    }

    if (profile.profileStatus === ProfileReviewStatus.PENDING_REVIEW) {
      throw new ForbiddenException(
        'Profile is already under admin review. Video cannot be changed.',
      );
    }

    if (profile.profileStatus === ProfileReviewStatus.APPROVED) {
      throw new ForbiddenException(
        'Profile is already approved. Video cannot be changed.',
      );
    }

    if (profile.profileStatus !== ProfileReviewStatus.AWAITING_VIDEO) {
      throw new BadRequestException(
        'Submit your professional profile first. Video is the final KYC step before review.',
      );
    }
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }
    return profile;
  }
}
