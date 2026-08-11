/** Bull job names on the home-service matching queue. */
export const MATCHING_JOB_NAMES = {
  CREATE_OFFERS: 'create-offers',
  EXPIRE_OFFER: 'expire-offer',
  EXPIRE_OFFERS: 'expire-offers',
} as const;

export type MatchingJobName =
  (typeof MATCHING_JOB_NAMES)[keyof typeof MATCHING_JOB_NAMES];

/** Deterministic Bull job IDs — enables O(1) removal without getJobs scans. */
export const matchingJobIds = {
  expireOffer: (offerId: string) => `expire-offer:${offerId}`,
  waitOnline: (bookingId: string, attempt: number) =>
    `matching-wait-online:${bookingId}:${attempt}`,
  nextTier: (bookingId: string, nextAttempt: number) =>
    `matching-tier:${bookingId}:${nextAttempt}`,
  exhaustedWake: (bookingId: string) => `matching-exhausted-wake:${bookingId}`,
  immediate: (bookingId: string, attempt: number) =>
    `matching-immediate:${bookingId}:${attempt}`,
  manualRetry: (bookingId: string) => `matching-retry:${bookingId}`,
  createOffers: (bookingId: string, attempt: number) =>
    `matching-create:${bookingId}:${attempt}`,
  scheduledDispatch: (bookingId: string) => `matching-scheduled:${bookingId}`,
} as const;

/** Redis keys used by matching infrastructure. */
export const matchingRedisKeys = {
  flowLock: (bookingId: string) => `matching:lock:${bookingId}`,
  jobIndex: (bookingId: string) => `matching:jobs:${bookingId}`,
  coordsCache: (bookingId: string) => `matching:coords:${bookingId}`,
  sameTierRetries: (bookingId: string, attempt: number) =>
    `matching:same-tier-retries:${bookingId}:${attempt}`,
} as const;

export const MATCHING_LOCK_TTL_SECONDS = 30;
export const MATCHING_COORDS_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const MATCHING_JOB_INDEX_TTL_SECONDS = 24 * 60 * 60;
/** Circuit breaker: max same-tier wait-online reschedules before exhausting. */
export const MAX_SAME_TIER_ONLINE_RETRIES = 20;
