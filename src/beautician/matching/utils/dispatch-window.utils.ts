/**
 * Dispatch-window helpers for scheduled (future-dated) home-service bookings.
 *
 * A booking is not matched immediately when it is booked for a future time;
 * its first dispatch is delayed until `bookingDate - DISPATCH_LEAD_TIME_MINUTES`.
 * Configure the lead time via env: DISPATCH_LEAD_TIME_MINUTES (default 0 =
 * dispatch exactly at the scheduled service time).
 */

export const DEFAULT_DISPATCH_LEAD_TIME_MINUTES = 0;

export function getDispatchLeadTimeMinutes(): number {
  const raw = process.env.DISPATCH_LEAD_TIME_MINUTES;
  if (raw === undefined || raw === '') {
    return DEFAULT_DISPATCH_LEAD_TIME_MINUTES;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_DISPATCH_LEAD_TIME_MINUTES;
  }

  return Math.floor(parsed);
}

/** Moment (now + lead time) at which a booking's dispatch window opens. */
export function getDispatchWindowOpenAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + getDispatchLeadTimeMinutes() * 60_000);
}

/** True once a scheduled booking may be dispatched (time has arrived). */
export function isDispatchWindowOpen(
  bookingDate: Date,
  now: Date = new Date(),
): boolean {
  return bookingDate.getTime() <= getDispatchWindowOpenAt(now).getTime();
}

/** Delay to schedule the first dispatch; 0 means "dispatch immediately". */
export function computeDispatchDelayMs(
  bookingDate: Date,
  now: Date = new Date(),
): number {
  return Math.max(
    0,
    bookingDate.getTime() - getDispatchWindowOpenAt(now).getTime(),
  );
}
