import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../auth/decorators/public.decorator';
import { KycStatusService } from './services/kyc-status.service';
import { QoreidWebhookService } from './services/qoreid-webhook.service';
import type { Request } from 'express';

@ApiTags('Webhooks')
@Controller('webhooks')
export class QoreidWebhookController {
  constructor(
    private readonly webhookService: QoreidWebhookService,
    private readonly kycStatusService: KycStatusService,
  ) {}

  @Public()
  @Post('qoreid')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'QoreID KYC workflow webhook' })
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

    const updated = await this.kycStatusService.applyWebhookUpdate(body);

    return {
      success: true,
      message: updated
        ? 'Webhook processed'
        : 'Webhook acknowledged (no action required)',
    };
  }
}