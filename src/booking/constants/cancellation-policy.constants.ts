import { BookingStatus } from '@prisma/client';

/** Statuses where a beautician has been dispatched for home service. */
export const DISPATCHED_BOOKING_STATUSES = new Set<BookingStatus>([
  BookingStatus.ASSIGNED,
  BookingStatus.EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.ARRIVED_VERIFIED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.AWAITING_CUSTOMER_CONFIRM,
]);

export const CANCELLATION_POLICY_CACHE_TTL_MS = 30_000;
