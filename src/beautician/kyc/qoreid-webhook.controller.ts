import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Public } from '../../auth/decorators/public.decorator';
import { KycStatusService } from './services/kyc-status.service';
import { QoreidWebhookService } from './services/qoreid-webhook.service';
import { StaffAddressVerificationService } from '../../staff/staff-address-verification.service';
import type { Request } from 'express';
import {
  QOREID_PROFILE_PHOTO_JOB,
  QOREID_PROFILE_PHOTO_QUEUE,
  type QoreidProfilePhotoJobData,
} from './constants/qoreid-profile-photo.constants';

@ApiTags('Webhooks')
@Controller('webhooks')
export class QoreidWebhookController {
  private readonly logger = new Logger(QoreidWebhookController.name);

  constructor(
    private readonly webhookService: QoreidWebhookService,
    private readonly kycStatusService: KycStatusService,
    private readonly addressVerificationService: StaffAddressVerificationService,
    @InjectQueue(QOREID_PROFILE_PHOTO_QUEUE)
    private readonly profilePhotoQueue: Queue<QoreidProfilePhotoJobData>,
  ) { }

  @Public()
  @Post('qoreid')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'QoreID KYC workflow webhook',
    description:
      'Acknowledges quickly. Profile photo from liveness is uploaded asynchronously via Bull.',
  })
  async handleWebhook(
    @Req() req: Request,
    @Body() body?: Record<string, unknown>,
    @Headers('x-verifyme-signature') verifymeSignature?: string,
    @Headers('x-qoreid-signature') signature?: string,
    @Headers('x-qoreid-hmac-signature') hmacSignature?: string,
  ) {
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ??
      (body !== undefined && body !== null ? JSON.stringify(body) : '');
    const signatureHeader =
      verifymeSignature ?? signature ?? hmacSignature;

    if (
      this.webhookService.isRegistrationProbe({
        body,
        rawBody,
        signatureHeader,
      })
    ) {
      return { success: true, message: 'Webhook endpoint reachable' };
    }

    this.webhookService.verifySignature(rawBody, signatureHeader);

    if (!body || Object.keys(body).length === 0) {
      throw new BadRequestException('Webhook payload is required');
    }

    // QoreID sends every event type to this one shared webhook URL --
    // "address" events (Physical Address Verification Pro, used by
    // Staff, not Beautician KYC) are routed to their own handler here
    // rather than through kycStatusService, which only knows about the
    // KYC/identity event shape.
    if (body.event === 'address') {
      await this.addressVerificationService.handleWebhook(body);
      return { success: true, message: 'Webhook processed' };
    }

    // Fast path: KYC status only (DB). Never await Cloudinary here.
    const updated = await this.kycStatusService.applyWebhookUpdate(body);

    // Fire-and-forget enqueue for liveness → profile photo (retryable job).
    if (
      updated &&
      this.webhookService.isVerificationCompletedEvent(body)
    ) {
      await this.enqueueProfilePhotoIfPresent(body, updated.userId);
    }

    return {
      success: true,
      message: updated
        ? 'Webhook processed'
        : 'Webhook acknowledged (no action required)',
    };
  }

  /**
   * Enqueues only. Job processing (download + Cloudinary) runs in the processor.
   */
  private async enqueueProfilePhotoIfPresent(
    body: Record<string, unknown>,
    userId: string,
  ): Promise<void> {
    const imageUrl = this.webhookService.extractLivenessImageUrl(body);
    if (!imageUrl) {
      this.logger.log(
        `No liveness imageUrl on verification_completed for user ${userId} — skip profile photo job`,
      );
      return;
    }

    const qoreIdRequestId = this.webhookService.extractQoreIdRequestId(body);

    try {
      await this.profilePhotoQueue.add(
        QOREID_PROFILE_PHOTO_JOB,
        {
          userId,
          imageUrl,
          qoreIdRequestId,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: true,
          removeOnFail: false,
          jobId: `qoreid-profile-photo:${userId}:${qoreIdRequestId ?? 'latest'}`,
        },
      );
      this.logger.log(
        `Queued profile photo upload for user ${userId} from QoreID liveness`,
      );
    } catch (err) {
      // Do not fail the webhook response if Redis/queue is briefly unavailable.
      this.logger.error(
        `Failed to enqueue profile photo job for user ${userId}: ${(err as Error).message}`,
      );
    }
  }
}
