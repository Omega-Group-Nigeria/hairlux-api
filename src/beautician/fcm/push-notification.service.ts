import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { FcmTokenService } from './fcm-token.service';

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
};

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);
  private messaging: Messaging | null = null;
  private enabled = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly fcmTokenService: FcmTokenService,
  ) {}

  onModuleInit() {
    try {
      this.messaging = this.initFirebaseMessaging();
      this.enabled = Boolean(this.messaging);
      if (this.enabled) {
        this.logger.log(
          'FCM HTTP v1 push notifications enabled (firebase-admin)',
        );
      } else {
        this.logger.warn(
          'Firebase not configured — push notifications will be skipped. Set FIREBASE_PROJECT_ID + service account credentials.',
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize Firebase Admin: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      this.messaging = null;
      this.enabled = false;
    }
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, string> },
  ) {
    if (!this.isFeatureEnabled()) {
      this.logger.debug(
        `FCM feature flag off — skipping push for user ${userId}`,
      );
      return { sent: 0, skipped: true };
    }

    if (!this.enabled || !this.messaging) {
      this.logger.debug(
        `FCM not configured — skipping push for user ${userId}`,
      );
      return { sent: 0, skipped: true };
    }

    const tokens = await this.fcmTokenService.listTokensForUser(userId);
    if (!tokens.length) {
      this.logger.debug(`No FCM tokens for user ${userId} — skip push`);
      return { sent: 0, skipped: true };
    }

    let sent = 0;
    for (const entry of tokens) {
      try {
        await this.messaging.send({
          token: entry.token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: this.stringifyData(payload.data),
          android: {
            priority: 'high',
          },
          apns: {
            headers: {
              'apns-priority': '10',
            },
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
        });
        sent += 1;
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code: string }).code)
            : '';

        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          this.logger.warn(
            `Removing invalid FCM token for user ${userId} (${code})`,
          );
          await this.fcmTokenService.removeToken(userId, entry.token);
        } else {
          this.logger.warn(
            `FCM send failed for user ${userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    this.logger.debug(
      `FCM sendToUser user=${userId} sent=${sent} devices=${tokens.length}`,
    );
    return { sent, skipped: false };
  }

  /**
   * `PUSH_NOTIFICATIONS_ENABLED=false|0|no|off` disables all FCM sends.
   * Default: enabled (when Firebase is configured).
   */
  private isFeatureEnabled(): boolean {
    const raw = this.configService.get<string>('PUSH_NOTIFICATIONS_ENABLED');
    if (raw == null || String(raw).trim() === '') {
      return true;
    }
    const normalized = String(raw).trim().toLowerCase();
    return !['false', '0', 'no', 'off'].includes(normalized);
  }

  private stringifyData(
    data?: Record<string, string>,
  ): Record<string, string> | undefined {
    if (!data) {
      return undefined;
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      out[key] = value == null ? '' : String(value);
    }
    return out;
  }

  private initFirebaseMessaging(): Messaging | null {
    const existing = getApps();
    if (existing.length > 0) {
      return getMessaging(existing[0]);
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const credentialsPath = this.configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
    const jsonRaw = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
    );
    const clientEmail = this.configService.get<string>(
      'FIREBASE_CLIENT_EMAIL',
    );
    const privateKeyRaw = this.configService.get<string>(
      'FIREBASE_PRIVATE_KEY',
    );

    let app: App | null = null;

    // 1) Full JSON in env (Railway/Render-friendly; raw JSON or base64)
    if (jsonRaw?.trim()) {
      const parsed = this.parseServiceAccountJson(jsonRaw);
      if (!parsed) {
        return null;
      }
      app = initializeApp({
        credential: cert(parsed as ServiceAccount),
        projectId:
          projectId ||
          (typeof parsed.project_id === 'string'
            ? parsed.project_id
            : undefined),
      });
      return getMessaging(app);
    }

    // 2) Split env fields
    if (clientEmail?.trim() && privateKeyRaw?.trim() && projectId?.trim()) {
      const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
      app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });
      return getMessaging(app);
    }

    // 3) Application Default Credentials (file path via GOOGLE_APPLICATION_CREDENTIALS or GCP)
    if (credentialsPath?.trim() || projectId?.trim()) {
      app = initializeApp({
        credential: applicationDefault(),
        projectId: projectId || undefined,
      });
      return getMessaging(app);
    }

    return null;
  }

  private parseServiceAccountJson(raw: string): ServiceAccountJson | null {
    try {
      let text = raw.trim();
      // Strip surrounding double-quotes if present (some env loaders add them)
      if (text.startsWith('"') && text.endsWith('"')) {
        text = text.slice(1, -1).replace(/\\"/g, '"');
      }
      if (!text.startsWith('{')) {
        // Attempt base64 decode
        text = Buffer.from(text, 'base64').toString('utf8');
      }
      // Sanitize bare control characters (Railway/Render may store \n literally
      // inside the JSON string instead of as the two-char escape sequence \n,
      // which makes JSON.parse throw "Bad control character").
      text = text.replace(/\r?\n/g, '\\n');
      const parsed = JSON.parse(text) as ServiceAccountJson;
      if (typeof parsed.private_key === 'string') {
        // Normalise: convert literal \n two-char sequences to real newlines
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      if (!parsed.client_email || !parsed.private_key) {
        this.logger.error(
          'FIREBASE_SERVICE_ACCOUNT_JSON missing client_email or private_key',
        );
        return null;
      }
      return parsed;
    } catch (error) {
      this.logger.error(
        `Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${
          error instanceof Error ? error.message : String(error)
        } | raw first 50 chars: ${JSON.stringify(raw.slice(0, 50))}`,
      );
      return null;
    }
  }
}
