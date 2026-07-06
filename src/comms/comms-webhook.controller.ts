import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { StreamWebhookService } from './services/stream-webhook.service';
import { StreamVideoClientService } from './services/stream-video-client.service';

@ApiTags('Comms Webhooks')
@Controller('comms/webhooks')
export class CommsWebhookController {
  private readonly logger = new Logger(CommsWebhookController.name);

  constructor(
    private readonly webhookService: StreamWebhookService,
    private readonly videoClient: StreamVideoClientService,
  ) {}

  @Public()
  @Post('stream')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Stream Chat/Video webhook (metadata audit only)' })
  async handleStreamWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature?: string,
  ) {
    if (!this.videoClient.isConfigured() || !this.videoClient.getWebhookSecret()) {
      throw new ServiceUnavailableException(
        'Stream comms webhooks are not configured on this server',
      );
    }

    const rawBody =
      req.rawBody ??
      Buffer.from(
        req.body !== undefined && req.body !== null
          ? JSON.stringify(req.body)
          : '',
      );

    try {
      const result = await this.webhookService.handleWebhook(
        rawBody,
        signature,
      );

      return {
        success: true,
        message: result.duplicate
          ? 'Webhook already processed'
          : result.processed
            ? 'Webhook processed'
            : 'Webhook ignored',
        data: result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Webhook processing failed';

      if (message.includes('signature')) {
        throw new UnauthorizedException('Invalid Stream webhook signature');
      }

      if (message.includes('Missing Stream webhook signature')) {
        throw new BadRequestException(message);
      }

      this.logger.error(`Stream webhook failed: ${message}`);
      throw new BadRequestException('Unable to process Stream webhook');
    }
  }
}