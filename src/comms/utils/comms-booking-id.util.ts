const BOOKING_CHANNEL_PREFIX = 'booking-';

export function parseBookingIdFromStreamChannelId(
  channelId: string | undefined | null,
): string | null {
  if (!channelId?.startsWith(BOOKING_CHANNEL_PREFIX)) {
    return null;
  }

  const bookingId = channelId.slice(BOOKING_CHANNEL_PREFIX.length);
  return bookingId.length > 0 ? bookingId : null;
}

export function parseBookingIdFromStreamCallCid(
  callCid: string | undefined | null,
): string | null {
  if (!callCid) {
    return null;
  }

  const [, callId] = callCid.split(':');
  return parseBookingIdFromStreamChannelId(callId);
}