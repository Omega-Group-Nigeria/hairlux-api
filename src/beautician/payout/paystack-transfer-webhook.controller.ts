import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Queue } from 'bull';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { PaystackService } from '../../payment/paystack.service';

@ApiTags('Webhooks')
@Controller('webhooks/paystack')
export class PaystackTransferWebhookController {
  private readonly logger = new Logger(PaystackTransferWebhookController.name);

  constructor(
    private readonly paystackService: PaystackService,
    @InjectQueue('paystack-transfer-webhooks')
    private readonly transferWebhookQueue: Queue,
  ) {}

  @Public()
  @Post('transfer')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleTransferWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    const rawBody =
      req.rawBody?.toString('utf-8') || JSON.stringify(req.body ?? {});

    if (
      !signature ||
      !this.paystackService.verifyWebhookSignature(rawBody, signature)
    ) {
      this.logger.warn(
        `Invalid Paystack transfer signature (rawLength=${rawBody.length})`,
      );
      return { status: 'invalid_signature' };
    }

    const body = req.body as { event?: string; data?: Record<string, unknown> };
    const event = body?.event ?? '';

    if (!event.startsWith('transfer.')) {
      return { status: 'ignored', event };
    }

    try {
      await this.transferWebhookQueue.add('transfer-webhook', body, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
      return { status: 'queued' };
    } catch (error) {
      this.logger.error(
        'Failed to queue Paystack transfer webhook',
        error instanceof Error ? error.stack : String(error),
      );
      return { status: 'queued_with_error' };
    }
  }
}