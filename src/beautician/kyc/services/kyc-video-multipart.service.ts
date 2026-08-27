import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, ProfileReviewStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { R2Service } from '../../../storage/r2.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { BeauticianMeCacheService } from '../../services/beautician-me-cache.service';
import {
  KYC_VIDEO_MAX_SIZE_BYTES,
  KYC_VIDEO_MULTIPART_TTL_SECONDS,
  KYC_VIDEO_PART_SIZE_BYTES,
  type KycVideoContentType,
} from '../../../storage/r2.constants';

type MultipartSession = {
  fileKey: string;
  r2UploadId: string;
  userId: string;
  contentType: KycVideoContentType;
  partSize: number;
  partCount: number;
  expiresAt: string;
  createdAt: string;
};

@Injectable()
export class KycVideoMultipartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly redis: RedisService,
    private readonly notificationService: BeauticianNotificationService,
    private readonly meCache: BeauticianMeCacheService,
  ) {}

  private sessionKey(uploadId: string): string {
    return `kyc:multipart:${uploadId}`;
  }

  async createSession(
    userId: string,
    contentType: KycVideoContentType,
    fileSizeBytes?: number,
  ): Promise<{
    fileKey: string;
    uploadId: string;
    contentType: KycVideoContentType;
    partSize: number;
    partCount: number;
    partUrls: Array<{ partNumber: number; uploadUrl: string; expiresAt: string }>;
    expiresAt: string;
    expiresIn: number;
  }> {
    const profile = await this.requireProfile(userId);
    this.assertCanSubmitVideo(profile);

    if (fileSizeBytes != null && fileSizeBytes > KYC_VIDEO_MAX_SIZE_BYTES) {
      throw new BadRequestException(`Video exceeds maximum size of ${KYC_VIDEO_MAX_SIZE_BYTES} bytes`);
    }

    const fileKey = this.r2.buildKycVideoKey(userId, contentType);
    const r2UploadId = await this.r2.createMultipartUpload(fileKey, contentType);
    const partCount = fileSizeBytes
      ? Math.max(1, Math.ceil(fileSizeBytes / KYC_VIDEO_PART_SIZE_BYTES))
      : 1;

    const partUrls = await this.r2.createPresignedPartUrls(fileKey, r2UploadId, partCount);

    const expiresAt = new Date(Date.now() + KYC_VIDEO_MULTIPART_TTL_SECONDS * 1000).toISOString();
    const session: MultipartSession = {
      fileKey,
      r2UploadId,
      userId,
      contentType,
      partSize: KYC_VIDEO_PART_SIZE_BYTES,
      partCount,
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    await this.redis.set(this.sessionKey(r2UploadId), session, KYC_VIDEO_MULTIPART_TTL_SECONDS);

    return {
      fileKey,
      uploadId: r2UploadId,
      contentType,
      partSize: KYC_VIDEO_PART_SIZE_BYTES,
      partCount,
      partUrls: partUrls.map((p) => ({ partNumber: p.partNumber, uploadUrl: p.uploadUrl, expiresAt: p.expiresAt })),
      expiresAt,
      expiresIn: KYC_VIDEO_MULTIPART_TTL_SECONDS,
    };
  }

  async refreshPartUrls(
    userId: string,
    uploadId: string,
  ): Promise<{
    fileKey: string;
    uploadId: string;
    contentType: KycVideoContentType;
    partUrls: Array<{ partNumber: number; uploadUrl: string; expiresAt: string }>;
    expiresAt: string;
    expiresIn: number;
  }> {
    const session = await this.getSession(uploadId, userId);
    if (Date.now() > new Date(session.expiresAt).getTime() - 2 * 60 * 1000) {
      // still valid but close to expiry, re-issue
    }

    const partUrls = await this.r2.createPresignedPartUrls(session.fileKey, session.r2UploadId, session.partCount);
    const expiresAt = new Date(Date.now() + KYC_VIDEO_MULTIPART_TTL_SECONDS * 1000).toISOString();

    const updated: MultipartSession = { ...session, expiresAt };
    await this.redis.set(this.sessionKey(uploadId), updated, KYC_VIDEO_MULTIPART_TTL_SECONDS);

    return {
      fileKey: session.fileKey,
      uploadId,
      contentType: session.contentType,
      partUrls: partUrls.map((p) => ({ partNumber: p.partNumber, uploadUrl: p.uploadUrl, expiresAt: p.expiresAt })),
      expiresAt,
      expiresIn: KYC_VIDEO_MULTIPART_TTL_SECONDS,
    };
  }

  async completeMultipart(
    userId: string,
    uploadId: string,
    fileKey: string,
    contentType: KycVideoContentType,
    parts: Array<{ partNumber: number; etag: string }>,
    fileSizeBytes?: number,
  ): Promise<{
    profileStatus: ProfileReviewStatus;
    hasKycVideo: boolean;
    fileKey: string;
    sizeBytes: number;
    contentType: string;
  }> {
    const session = await this.getSession(uploadId, userId);

    if (session.fileKey !== fileKey) {
      throw new BadRequestException('File key does not match upload session');
    }
    if (!this.r2.isOwnedKycVideoKey(userId, fileKey)) {
      throw new BadRequestException('Invalid file key for this account');
    }
    if (session.contentType !== contentType) {
      throw new BadRequestException('Content type mismatch');
    }

    const profile = await this.requireProfile(userId);
    this.assertCanSubmitVideo(profile);

    if (!parts.length) {
      throw new BadRequestException('No parts provided');
    }

    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    if (sorted.length !== session.partCount) {
      throw new BadRequestException(`Expected ${session.partCount} parts, got ${sorted.length}`);
    }
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].partNumber !== i + 1) {
        throw new BadRequestException(`Missing part ${i + 1}`);
      }
      if (!sorted[i].etag?.trim()) {
        throw new BadRequestException(`Missing ETag for part ${sorted[i].partNumber}`);
      }
    }

    await this.r2.completeMultipartUpload(
      fileKey,
      session.r2UploadId,
      sorted.map((p) => ({ ETag: p.etag, PartNumber: p.partNumber })),
    );

    await this.redis.del(this.sessionKey(uploadId));

    const head = await this.r2.headObject(fileKey);

    if (!head.contentLength || head.contentLength <= 0) {
      throw new BadRequestException('Completed video is empty');
    }
    if (head.contentLength > KYC_VIDEO_MAX_SIZE_BYTES) {
      throw new BadRequestException(`Video exceeds maximum size`);
    }

    const now = new Date();
    const moved = await this.prisma.beauticianProfile.updateMany({
      where: { userId, kycStatus: KycStatus.VERIFIED, profileStatus: ProfileReviewStatus.AWAITING_VIDEO },
      data: {
        kycVideoKey: fileKey,
        profileStatus: ProfileReviewStatus.PENDING_REVIEW,
        profileSubmittedAt: profile.profileSubmittedAt ?? now,
        reviewNotes: null,
      },
    });

    if (moved.count !== 1) {
      const current = await this.prisma.beauticianProfile.findUnique({ where: { userId }, select: { kycVideoKey: true, profileStatus: true } });
      if (current?.kycVideoKey === fileKey && current.profileStatus === ProfileReviewStatus.PENDING_REVIEW) {
        return { profileStatus: current.profileStatus, hasKycVideo: true, fileKey, sizeBytes: head.contentLength, contentType: head.contentType ?? contentType };
      }
      throw new BadRequestException('Profile is no longer awaiting video submission');
    }

    const updated = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    if (updated) {
      await this.meCache.invalidate(userId);
      await this.notificationService.notifyProfileSubmitted(updated.user);
    }

    return {
      profileStatus: ProfileReviewStatus.PENDING_REVIEW,
      hasKycVideo: true,
      fileKey,
      sizeBytes: head.contentLength,
      contentType: head.contentType ?? contentType,
    };
  }

  async abortSession(userId: string, uploadId: string): Promise<void> {
    const session = await this.redis.get<MultipartSession>(this.sessionKey(uploadId));
    if (!session) return;
    if (session.userId !== userId) throw new BadRequestException('Not your upload');
    await this.r2.abortMultipartUpload(session.fileKey, session.r2UploadId);
    await this.redis.del(this.sessionKey(uploadId));
  }

  private async getSession(uploadId: string, userId: string): Promise<MultipartSession> {
    const session = await this.redis.get<MultipartSession>(this.sessionKey(uploadId));
    if (!session) throw new NotFoundException('Upload session not found or expired. Request a new upload.');
    if (session.userId !== userId) throw new BadRequestException('Not your upload session');
    if (!this.r2.isOwnedKycVideoKey(userId, session.fileKey)) throw new BadRequestException('Invalid session');
    return session;
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Beautician profile not found');
    return profile;
  }

  private assertCanSubmitVideo(profile: { kycStatus: KycStatus; profileStatus: ProfileReviewStatus }) {
    if (profile.kycStatus !== KycStatus.VERIFIED) {
      throw new BadRequestException('Complete KYC verification before submitting a video');
    }
    if (profile.profileStatus === ProfileReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException('Profile is already under admin review');
    }
    if (profile.profileStatus === ProfileReviewStatus.APPROVED) {
      throw new BadRequestException('Profile is already approved');
    }
    if (profile.profileStatus !== ProfileReviewStatus.AWAITING_VIDEO) {
      throw new BadRequestException('Submit your professional profile first. Video is the final KYC step before review.');
    }
  }
}
