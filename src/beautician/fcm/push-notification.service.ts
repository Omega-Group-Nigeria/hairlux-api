import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { FcmTokenService } from './fcm-token.service';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly fcmTokenService: FcmTokenService,
  ) {}

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, string> },
  ) {
    const serverKey = this.configService.get<string>('FCM_SERVER_KEY');
    if (!serverKey) {
      this.logger.debug('FCM_SERVER_KEY not configured — skipping push');
      return { sent: 0, skipped: true };
    }

    const tokens = await this.fcmTokenService.listTokensForUser(userId);
    if (!tokens.length) {
      return { sent: 0, skipped: true };
    }

    let sent = 0;
    for (const entry of tokens) {
      try {
        await firstValueFrom(
          this.httpService.post(
            'https://fcm.googleapis.com/fcm/send',
            {
              to: entry.token,
              notification: {
                title: payload.title,
                body: payload.body,
              },
              data: payload.data ?? {},
            },
            {
              headers: {
                Authorization: `key=${serverKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 5000,
            },
          ),
        );
        sent += 1;
      } catch (error) {
        this.logger.warn(
          `FCM send failed for user ${userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { sent, skipped: false };
  }
}