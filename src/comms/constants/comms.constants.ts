export const COMMS_CHANNEL_TYPE = 'messaging';

/** Stream Video call type for booking-scoped audio calls. */
export const COMMS_CALL_TYPE = 'default';

export const STREAM_TOKEN_TTL_SECONDS = 60 * 60;

export function buildStreamChannelId(bookingId: string): string {
  return `booking-${bookingId}`;
}

export function buildStreamCallId(bookingId: string): string {
  return buildStreamChannelId(bookingId);
}

export function buildStreamCallCid(bookingId: string): string {
  return `${COMMS_CALL_TYPE}:${buildStreamCallId(bookingId)}`;
}