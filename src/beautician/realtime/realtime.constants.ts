export const REALTIME_NAMESPACE = '/ws';

export const REALTIME_EVENTS = {
  CONNECTED: 'connected',
  JOINED: 'joined',
  BOOKING_LOCATION: 'booking.location',
  BOOKING_STATUS: 'booking.status',
  JOB_OFFER: 'beautician.job_offer',
  OFFER_EXPIRED: 'beautician.offer_expired',
} as const;

export const realtimeRoom = {
  booking: (bookingId: string) => `booking:${bookingId}`,
  beauticianOffers: (userId: string) => `beautician:${userId}:offers`,
};