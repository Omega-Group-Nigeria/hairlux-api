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

    await call.getOrCreate({
      video: false,
      data: {
        created_by_id: params.customerUserId,
        members: [
          { user_id: params.customerUserId },
          { user_id: params.beauticianUserId },
        ],
        custom: {
          bookingId: params.bookingId,
          reservationCode: params.reservationCode,
          bookingType: 'HOME_SERVICE',
        },
      },
    });

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