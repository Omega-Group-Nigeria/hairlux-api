import { Injectable, Logger } from '@nestjs/common';
import { BookingCommsEventType } from '@prisma/client';
import type { WHEvent } from '@stream-io/node-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import {
  STREAM_EVENT_TYPE_MAP,
  TRACKED_STREAM_WEBHOOK_TYPES,
} from '../constants/comms-events.constants';
import {
  parseBookingIdFromStreamCallCid,
  parseBookingIdFromStreamChannelId,
} from '../utils/comms-booking-id.util';
import { CommsEventService } from './comms-event.service';
import { StreamVideoClientService } from './stream-video-client.service';

type MappedStreamEvent = {
  bookingId: string;
  eventType: BookingCommsEventType;
  streamEventId: string;
  actorUserId: string | null;
  callCid: string | null;
  payload: Record<string, unknown>;
};

@Injectable()
export class StreamWebhookService {
  private readonly logger = new Logger(StreamWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly videoClient: StreamVideoClientService,
    private readonly eventService: CommsEventService,
  ) {}

  async handleWebhook(
    rawBody: string | Buffer,
    signature: string | undefined,
  ): Promise<{ processed: boolean; duplicate: boolean }> {
    if (!signature) {
      throw new Error('Missing Stream webhook signature');
    }

    const event = this.videoClient.verifyAndParseWebhook(rawBody, signature);
    return this.processEvent(event);
  }

  async processEvent(
    event: WHEvent,
  ): Promise<{ processed: boolean; duplicate: boolean }> {
    if (event.type === 'call.ring') {
      await this.enforceRingParticipant(event as unknown as { call_cid: string; user?: { id: string } });
      return { processed: true, duplicate: false };
    }

    if (!TRACKED_STREAM_WEBHOOK_TYPES.has(event.type)) {
      return { processed: false, duplicate: false };
    }

    const mapped = this.mapEvent(event);
    if (!mapped) {
      return { processed: false, duplicate: false };
    }

    const session = await this.prisma.bookingCommsSession.findUnique({
      where: { bookingId: mapped.bookingId },
    });

    if (!session) {
      this.logger.debug(
        `Ignoring Stream webhook ${mapped.streamEventId}: no comms session for booking ${mapped.bookingId}`,
      );
      return { processed: false, duplicate: false };
    }

    const created = await this.eventService.recordEvent({
      sessionId: session.id,
      eventType: mapped.eventType,
      actorUserId: mapped.actorUserId,
      streamEventId: mapped.streamEventId,
      payload: mapped.payload,
    });

    if (!created) {
      return { processed: true, duplicate: true };
    }

    if (
      mapped.eventType === BookingCommsEventType.CALL_STARTED &&
      mapped.callCid
    ) {
      await this.eventService.updateSessionCallCid(session.id, mapped.callCid);
    }

    return { processed: true, duplicate: false };
  }

  private async enforceRingParticipant(event: { call_cid: string; user?: { id: string } }): Promise<void> {
    const bookingId = parseBookingIdFromStreamCallCid(event.call_cid);
    if (!bookingId) {
      throw new Error('Invalid call_cid for ring enforcement');
    }

    const session = await this.prisma.bookingCommsSession.findUnique({
      where: { bookingId },
    });

    if (!session || session.status !== 'ACTIVE') {
      throw new Error(`Ring rejected: no ACTIVE comms session for booking ${bookingId}`);
    }

    const callerId = event.user?.id;
    const isParticipant = callerId === session.customerUserId || callerId === session.beauticianUserId;

    if (!callerId || !isParticipant) {
      throw new Error(`Ring rejected: caller ${callerId ?? 'unknown'} is not a participant for booking ${bookingId}`);
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    if (!booking) {
      throw new Error(`Ring rejected: booking ${bookingId} not found`);
    }

    const canUse = session.status === 'ACTIVE' && [
      'ASSIGNED',
      'EN_ROUTE',
      'ARRIVED',
      'ARRIVED_VERIFIED',
      'IN_PROGRESS',
      'AWAITING_CUSTOMER_CONFIRM',
    ].includes(booking.status);

    if (!canUse) {
      throw new Error(`Ring rejected: booking ${bookingId} status ${booking.status} cannot call`);
    }
  }

  private mapEvent(event: WHEvent): MappedStreamEvent | null {
    const eventType = STREAM_EVENT_TYPE_MAP[event.type];
    if (!eventType) {
      return null;
    }

    switch (event.type) {
      case 'message.new': {
        const bookingId = parseBookingIdFromStreamChannelId(event.channel_id);
        if (!bookingId) {
          return null;
        }

        return {
          bookingId,
          eventType,
          streamEventId: `message.new:${event.message_id}`,
          actorUserId: event.message?.user?.id ?? null,
          callCid: null,
          payload: {
            channelId: event.channel_id ?? null,
            messageId: event.message_id,
          },
        };
      }
      case 'call.session_started':
      case 'call.session_ended': {
        const bookingId = parseBookingIdFromStreamCallCid(event.call_cid);
        if (!bookingId) {
          return null;
        }

        return {
          bookingId,
          eventType,
          streamEventId: `${event.type}:${event.session_id}`,
          actorUserId: null,
          callCid: event.call_cid,
          payload: {
            callCid: event.call_cid,
            sessionId: event.session_id,
          },
        };
      }
      case 'call.ended': {
        const bookingId = parseBookingIdFromStreamCallCid(event.call?.cid);
        if (!bookingId) {
          return null;
        }

        return {
          bookingId,
          eventType,
          streamEventId: `call.ended:${event.call?.cid}:${event.created_at?.toISOString() ?? 'unknown'}`,
          actorUserId: null,
          callCid: event.call?.cid ?? null,
          payload: {
            callCid: event.call?.cid ?? null,
          },
        };
      }
      default:
        return null;
    }
  }
}