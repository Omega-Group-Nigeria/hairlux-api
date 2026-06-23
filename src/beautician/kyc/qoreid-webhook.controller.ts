import {
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
    @Body() body: Record<string, unknown>,
    @Headers('x-qoreid-signature') signature?: string,
    @Headers('x-qoreid-hmac-signature') hmacSignature?: string,
  ) {
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ??
      JSON.stringify(body);

    this.webhookService.verifySignature(
      rawBody,
      signature ?? hmacSignature,
    );

    await this.kycStatusService.applyWebhookUpdate(body);

    return { success: true, message: 'Webhook processed' };
  }
}