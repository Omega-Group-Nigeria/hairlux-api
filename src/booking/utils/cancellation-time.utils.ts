import { Booking } from '@prisma/client';

export function getMinutesUntilService(booking: Booking, now = new Date()): number {
  const serviceAt = getServiceDateTime(booking);
  return Math.floor((serviceAt.getTime() - now.getTime()) / 60_000);
}

export function getMinutesSinceBooking(booking: Booking, now = new Date()): number {
  return Math.floor((now.getTime() - booking.createdAt.getTime()) / 60_000);
}

export function getServiceDateTime(booking: Booking): Date {
  const datePart = booking.bookingDate.toISOString().slice(0, 10);
  return new Date(`${datePart}T${booking.bookingTime}:00`);
}

export function isNoShowReason(reason?: string | null): boolean {
  const normalized = (reason ?? '').toLowerCase();
  return (
    normalized.includes('no-show') ||
    normalized.includes('no show') ||
    normalized.includes('noshow')
  );
}
