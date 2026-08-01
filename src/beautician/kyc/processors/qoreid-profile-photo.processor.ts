import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import {
  QOREID_PROFILE_PHOTO_JOB,
  QOREID_PROFILE_PHOTO_QUEUE,
  type QoreidProfilePhotoJobData,
} from '../constants/qoreid-profile-photo.constants';
import { KycProfilePhotoService } from '../services/kyc-profile-photo.service';

@Processor(QOREID_PROFILE_PHOTO_QUEUE)
export class QoreidProfilePhotoProcessor {
  private readonly logger = new Logger(QoreidProfilePhotoProcessor.name);

  constructor(
    private readonly kycProfilePhotoService: KycProfilePhotoService,
  ) {}

  @Process(QOREID_PROFILE_PHOTO_JOB)
  async handleUpload(job: Job<QoreidProfilePhotoJobData>) {
    const { userId, imageUrl, qoreIdRequestId } = job.data;

    this.logger.log(
      `Processing KYC profile photo job ${job.id} for user ${userId}` +
        (qoreIdRequestId ? ` (qoreId=${qoreIdRequestId})` : '') +
        ` attempt ${job.attemptsMade + 1}`,
    );

    try {
      const result =
        await this.kycProfilePhotoService.applyFromRemoteLivenessUrl(
          userId,
          imageUrl,
        );
      return { status: 'ok', ...result };
    } catch (err) {
      this.logger.error(
        `KYC profile photo job failed for user ${userId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err; // allow Bull retries
    }
  }
}
