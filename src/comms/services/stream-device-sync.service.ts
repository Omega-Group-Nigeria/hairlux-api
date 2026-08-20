import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FcmPlatform } from '@prisma/client';
import { FcmTokenService } from '../../beautician/fcm/fcm-token.service';
import { StreamClientService } from './stream-client.service';

@Injectable()
export class StreamDeviceSyncService {
  private readonly logger = new Logger(StreamDeviceSyncService.name);

  constructor(
    private readonly streamClient: StreamClientService,
    private readonly fcmTokenService: FcmTokenService,
    private readonly configService: ConfigService,
  ) {}

  async syncUserDevices(userId: string): Promise<void> {
    if (!this.streamClient.isConfigured()) {
      return;
    }

    const devices = await this.fcmTokenService.listTokensForUser(userId);
    if (!devices.length) {
      return;
    }

    const client = this.streamClient.getClient();

    await Promise.all(
      devices.map(async (device) => {
        try {
          await client.addDevice(
            device.token,
            this.resolvePushProvider(device.platform),
            userId,
            this.resolvePushProviderName(device.platform),
          );
        } catch (error) {
          this.logger.warn(
            `Failed to sync FCM device for user ${userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
  }

  async syncParticipants(userIds: string[]): Promise<void> {
    await Promise.all(userIds.map((userId) => this.syncUserDevices(userId)));
  }

  private resolvePushProvider(platform: FcmPlatform): 'firebase' | 'apn' {
    return platform === FcmPlatform.IOS ? 'apn' : 'firebase';
  }

  /**
   * Returns the Stream push provider name matching the configured Firebase
   * provider. Set STREAM_FCM_PUSH_PROVIDER_NAME in env to override.
   * Defaults to "Hairlux".
   */
  private resolvePushProviderName(platform: FcmPlatform): string | undefined {
    if (platform === FcmPlatform.IOS) {
      // APN providers don't use a named Firebase provider
      return undefined;
    }
    return (
      this.configService.get<string>('STREAM_FCM_PUSH_PROVIDER_NAME') ??
      'Hairlux'
    );
  }
}