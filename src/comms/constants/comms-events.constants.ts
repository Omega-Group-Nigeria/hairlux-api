import { BookingCommsEventType } from '@prisma/client';

export const TRACKED_STREAM_WEBHOOK_TYPES = new Set([
  'message.new',
  'call.session_started',
  'call.session_ended',
  'call.ended',
  'call.ring',
]);

export const STREAM_EVENT_TYPE_MAP: Record<string, BookingCommsEventType> = {
  'message.new': BookingCommsEventType.CHAT_MESSAGE,
  'call.session_started': BookingCommsEventType.CALL_STARTED,
  'call.session_ended': BookingCommsEventType.CALL_ENDED,
  'call.ended': BookingCommsEventType.CALL_ENDED,
};

/** Max Stream token mint requests per user per minute. */
export const COMMS_TOKEN_RATE_LIMIT = 30;