export const BEAUTICIANS_ONLINE_GEO_KEY = 'beauticians:online';

export const beauticianMetaKey = (userId: string) =>
  `beautician:meta:${userId}`;

export const beauticianLastRematchPosKey = (userId: string) =>
  `beautician:last-rematch-pos:${userId}`;

export const bookingExhaustedWakeRetryKey = (bookingId: string) =>
  `booking:exhausted-wake-retry:${bookingId}`;