import { Booking } from '@prisma/client';
import { BOOKING_TIMEZONE } from '../constants/cancellation-policy.constants';
import { bookingDateTimeFromParts } from './booking-datetime.utils';

export function getMinutesUntilService(
  booking: Booking,
  now = new Date(),
): number {
  const serviceAt = getServiceDateTime(booking);
  return Math.floor((serviceAt.getTime() - now.getTime()) / 60_000);
}

export function getMinutesSinceBooking(
  booking: Booking,
  now = new Date(),
): number {
  return Math.floor((now.getTime() - booking.createdAt.getTime()) / 60_000);
}

export function getServiceDateTime(booking: Booking): Date {
  const datePart = formatCalendarDateInTimezone(
    booking.bookingDate,
    BOOKING_TIMEZONE,
  );
  return bookingDateTimeFromParts(datePart, booking.bookingTime);
}

export function formatCalendarDateInTimezone(
  date: Date,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isNoShowReason(reason?: string | null): boolean {
  const normalized = (reason ?? '').toLowerCase();
  return (
    normalized.includes('no-show') ||
    normalized.includes('no show') ||
    normalized.includes('noshow')
  );
}
