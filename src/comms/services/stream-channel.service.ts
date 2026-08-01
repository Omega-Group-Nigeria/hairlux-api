import { Injectable, Logger } from '@nestjs/common';
import { COMMS_CHANNEL_TYPE } from '../constants/comms.constants';
import { StreamClientService } from './stream-client.service';

export interface CreateBookingChannelParams {
  streamChannelId: string;
  createdByUserId: string;
  memberUserIds: string[];
  bookingId: string;
  reservationCode: string | null;
}

@Injectable()
export class StreamChannelService {
  private readonly logger = new Logger(StreamChannelService.name);

  constructor(private readonly streamClient: StreamClientService) {}

  async ensureBookingChannel(params: CreateBookingChannelParams): Promise<void> {
    const client = this.streamClient.getClient();
    const channel = client.channel(COMMS_CHANNEL_TYPE, params.streamChannelId, {
      created_by_id: params.createdByUserId,
      members: params.memberUserIds,
      bookingId: params.bookingId,
      reservationCode: params.reservationCode,
      bookingType: 'HOME_SERVICE',
    } as Record<string, unknown>);

    const existing = await client.queryChannels(
      {
        type: COMMS_CHANNEL_TYPE,
        id: params.streamChannelId,
      },
      {},
      { limit: 1 },
    );

    if (existing.length > 0) {
      await channel.update({
        frozen: false,
        members: params.memberUserIds,
      });
      return;
    }

    try {
      await channel.create();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('already exists')) {
        this.logger.warn(
          `Stream channel ${params.streamChannelId} already exists; continuing`,
        );
        return;
      }
      throw error;
    }
  }

  async freezeChannel(streamChannelId: string): Promise<void> {
    const client = this.streamClient.getClient();
    const channel = client.channel(COMMS_CHANNEL_TYPE, streamChannelId);
    await channel.update({ frozen: true });
  }
}