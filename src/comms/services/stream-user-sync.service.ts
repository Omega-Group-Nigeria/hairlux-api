import { Injectable } from '@nestjs/common';
import { StreamUserProfile } from '../types/comms.types';
import { StreamClientService } from './stream-client.service';

@Injectable()
export class StreamUserSyncService {
  constructor(private readonly streamClient: StreamClientService) {}

  async upsertParticipants(profiles: StreamUserProfile[]): Promise<void> {
    if (!profiles.length) {
      return;
    }

    const client = this.streamClient.getClient();
    await client.upsertUsers(
      profiles.map((profile) => ({
        id: profile.userId,
        name: profile.displayName,
        ...(profile.imageUrl ? { image: profile.imageUrl } : {}),
      })),
    );
  }
}