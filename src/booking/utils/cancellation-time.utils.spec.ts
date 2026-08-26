import { BookingType } from '@prisma/client';
import {
  formatCalendarDateInTimezone,
  getServiceDateTime,
} from './cancellation-time.utils';

describe('cancellation-time.utils', () => {
  it('uses Africa/Lagos calendar date for service datetime', () => {
    const booking = {
      bookingDate: new Date('2026-09-01T23:30:00.000Z'),
      bookingTime: '10:00',
      bookingType: BookingType.WALK_IN,
    } as any;

    expect(formatCalendarDateInTimezone(booking.bookingDate, 'Africa/Lagos')).toBe(
      '2026-09-02',
    );
    expect(getServiceDateTime(booking).toISOString()).toBe(
      '2026-09-02T09:00:00.000Z',
    );
  });
});
