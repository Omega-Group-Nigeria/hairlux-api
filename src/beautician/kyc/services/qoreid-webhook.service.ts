import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class QoreidWebhookService {
  private readonly logger = new Logger(QoreidWebhookService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * QoreID sends an empty/signature-less POST when registering the webhook URL.
   * Treat that probe as success so the dashboard can confirm reachability.
   */
  isRegistrationProbe(params: {
    body?: Record<string, unknown>;
    rawBody?: string;
    signatureHeader?: string;
  }): boolean {
    const hasSignature = Boolean(params.signatureHeader?.trim());
    const trimmedRaw = (params.rawBody ?? '').trim();
    const isEmptyBody =
      trimmedRaw === '' ||
      trimmedRaw === '{}' ||
      trimmedRaw === 'null' ||
      trimmedRaw === 'undefined' ||
      Object.keys(params.body ?? {}).length === 0;

    return !hasSignature || isEmptyBody;
  }

  verifySignature(rawBody: string, signatureHeader?: string): void {
    const secret = this.configService.get<string>('QOREID_WEBHOOK_SECRET');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (!secret) {
      if (nodeEnv === 'production') {
        this.logger.error(
          'QOREID_WEBHOOK_SECRET missing in production — rejecting webhook',
        );
        throw new UnauthorizedException('Webhook verification unavailable');
      }

      this.logger.warn(
        'QOREID_WEBHOOK_SECRET not set — skipping webhook signature verification (non-production)',
      );
      return;
    }

    if (!signatureHeader) {
      throw new UnauthorizedException('Missing QoreID webhook signature');
    }

    const expected = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const provided = signatureHeader.replace(/^sha256=/i, '').trim();

    try {
      const valid = timingSafeEqual(
        Buffer.from(expected, 'utf8'),
        Buffer.from(provided, 'utf8'),
      );
      if (!valid) {
        throw new UnauthorizedException('Invalid QoreID webhook signature');
      }
    } catch {
      throw new UnauthorizedException('Invalid QoreID webhook signature');
    }
  }
}