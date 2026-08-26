import { BOOKING_TIMEZONE } from '../constants/cancellation-policy.constants';

/** Africa/Lagos fixed UTC offset (no DST) — same convention as salon bookings. */
const LAGOS_UTC_OFFSET = '+01:00';

/**
 * Combines a calendar date (YYYY-MM-DD) and wall-clock time (HH:MM) into a Date
 * anchored to Africa/Lagos — not the server timezone, which shifted bookings +1h.
 */
export function bookingDateTimeFromParts(
  dateStr: string,
  timeStr: string,
): Date {
  const [hourPart = '', minutePart = '', ...extraParts] = timeStr.split(':');

  const hour = Number(hourPart);
  const minute = Number(minutePart === '' ? '0' : minutePart);

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const secondsPart: string | undefined = extraParts[0];
  const timeValid =
    extraParts.length <= 1 &&
    /^\d{1,2}$/.test(hourPart) &&
    (minutePart === '' || /^\d{1,2}$/.test(minutePart)) &&
    (secondsPart === undefined || /^\d{1,2}$/.test(secondsPart)) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59;

  if (!dateValid || !timeValid) {
    throw new Error(
      `Invalid booking date/time parts: "${dateStr}" "${timeStr}"`,
    );
  }

  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');

  return new Date(`${dateStr}T${hh}:${mm}:00${LAGOS_UTC_OFFSET}`);
}

export { BOOKING_TIMEZONE as BOOKING_BUSINESS_TIMEZONE };
