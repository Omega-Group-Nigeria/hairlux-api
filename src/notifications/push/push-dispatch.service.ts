import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushNotificationService } from '../../beautician/fcm/push-notification.service';
import { PushMessageFactory } from './push-message.factory';
import type { PushEventKey, PushTemplateVars } from './push-event.types';

/**
 * Application-facing push API: resolve copy from constants, then FCM transport.
 * Domain notifiers should call this — not Firebase directly.
 *
 * Env:
 * - `PUSH_NOTIFICATIONS_ENABLED` — `false` / `0` / `no` / `off` disables all pushes
 *   (default: enabled when Firebase is configured).
 */
@Injectable()
export class PushDispatchService {
  private readonly logger = new Logger(PushDispatchService.name);

  constructor(
    private readonly factory: PushMessageFactory,
    private readonly push: PushNotificationService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Fire-and-forget friendly: never throws to callers.
   * `data` is merged with `type` = event key (all values stringified by FCM layer).
   * Logs event + userId + sent/skipped — never logs device tokens.
   */
  async sendEvent(
    userId: string,
    event: PushEventKey,
    vars: PushTemplateVars = {},
    data: Record<string, string> = {},
  ): Promise<{ sent: number; skipped: boolean; reason?: string }> {
    if (!this.isGloballyEnabled()) {
      this.logger.debug(
        `Push ${event} → user ${userId}: sent=0 skipped=true reason=feature_disabled`,
      );
      return { sent: 0, skipped: true, reason: 'feature_disabled' };
    }

    try {
      const message = this.factory.resolve(event, vars);
      const result = await this.push.sendToUser(userId, {
        title: message.title,
        body: message.body,
        data: {
          type: message.type,
          ...data,
        },
      });

      if (result.sent > 0) {
        this.logger.log(
          `Push ${event} → user ${userId}: sent=${result.sent} skipped=${result.skipped}`,
        );
      } else {
        this.logger.debug(
          `Push ${event} → user ${userId}: sent=${result.sent} skipped=${result.skipped}`,
        );
      }

      return result;
    } catch (error) {
      this.logger.warn(
        `Push ${event} failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { sent: 0, skipped: true, reason: 'error' };
    }
  }

  /** False when env explicitly disables pushes. */
  isGloballyEnabled(): boolean {
    const raw = this.config.get<string>('PUSH_NOTIFICATIONS_ENABLED');
    if (raw == null || String(raw).trim() === '') {
      return true;
    }
    const normalized = String(raw).trim().toLowerCase();
    return !['false', '0', 'no', 'off'].includes(normalized);
  }
}
