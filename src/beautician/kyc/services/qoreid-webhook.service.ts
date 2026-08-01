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

  isVerificationCompletedEvent(payload: Record<string, unknown>): boolean {
    const eventType = payload.event_type;
    if (typeof eventType === 'string') {
      return eventType === 'verification_completed';
    }
    // Legacy payloads without event_type still apply KYC updates
    return true;
  }

  /**
   * Liveness frame used as the beautician profile photo.
   * Path: data.summary.liveness_check.imageUrl
   */
  extractLivenessImageUrl(payload: Record<string, unknown>): string | null {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : null;
    if (!data) {
      return null;
    }

    const summary =
      data.summary && typeof data.summary === 'object'
        ? (data.summary as Record<string, unknown>)
        : null;
    if (!summary) {
      return null;
    }

    const liveness =
      summary.liveness_check && typeof summary.liveness_check === 'object'
        ? (summary.liveness_check as Record<string, unknown>)
        : null;
    if (!liveness) {
      return null;
    }

    const imageUrl = liveness.imageUrl ?? liveness.image_url;
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
      return null;
    }

    return imageUrl.trim();
  }

  extractQoreIdRequestId(payload: Record<string, unknown>): string | undefined {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : null;
    if (!data) {
      return undefined;
    }
    const id = data.id;
    if (typeof id === 'string' || typeof id === 'number') {
      return String(id);
    }
    return undefined;
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

    const expected = createHmac('sha512', secret)
      .update(rawBody)
      .digest('hex');

    const provided = signatureHeader.replace(/^sha512=/i, '').trim();

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