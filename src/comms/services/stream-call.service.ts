import { Injectable, Logger } from '@nestjs/common';
import {
  buildStreamCallCid,
  buildStreamCallId,
  COMMS_CALL_TYPE,
} from '../constants/comms.constants';
import { StreamVideoClientService } from './stream-video-client.service';

@Injectable()
export class StreamCallService {
  private readonly logger = new Logger(StreamCallService.name);

  constructor(private readonly videoClient: StreamVideoClientService) {}

  buildCallCid(bookingId: string): string {
    return buildStreamCallCid(bookingId);
  }

  async ensureBookingCall(params: {
    bookingId: string;
    customerUserId: string;
    beauticianUserId: string;
    reservationCode: string | null;
  }): Promise<string> {
    const client = this.videoClient.getClient();
    const callId = buildStreamCallId(params.bookingId);
    const call = client.video.call(COMMS_CALL_TYPE, callId);

    const expectedMembers = [params.customerUserId, params.beauticianUserId];

    const created = await call.getOrCreate({
      video: false,
      data: {
        created_by_id: params.customerUserId,
        members: expectedMembers.map((user_id) => ({ user_id })),
        custom: {
          bookingId: params.bookingId,
          reservationCode: params.reservationCode,
          bookingType: 'HOME_SERVICE',
        },
      },
    });

    try {
      const existingMembers: string[] =
        (created as unknown as { call?: { members?: Array<{ user_id: string }> } })
          ?.call?.members?.map((m) => m.user_id) ?? [];

      const needsSync =
        existingMembers.length !== expectedMembers.length ||
        !expectedMembers.every((id) => existingMembers.includes(id));

      if (needsSync) {
        const toRemove = existingMembers.filter((id) => !expectedMembers.includes(id));
        await call.updateCallMembers({
          update_members: expectedMembers.map((user_id) => ({ user_id })),
          ...(toRemove.length ? { remove_members: toRemove } : {}),
        });
        this.logger.log(`Synced Stream call ${callId} members to [${expectedMembers.join(',')}]`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to sync Stream call members for booking ${params.bookingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const callCid = this.buildCallCid(params.bookingId);
    this.logger.log(`Ensured Stream audio call ${callCid}`);
    return callCid;
  }

  async endBookingCall(bookingId: string): Promise<void> {
    if (!this.videoClient.isConfigured()) {
      return;
    }

    const callId = buildStreamCallId(bookingId);
    const call = this.videoClient.getClient().video.call(COMMS_CALL_TYPE, callId);

    try {
      await call.end();
      this.logger.log(`Ended Stream audio call ${COMMS_CALL_TYPE}:${callId}`);
    } catch (error) {
      this.logger.warn(
        `Could not end Stream call for booking ${bookingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}