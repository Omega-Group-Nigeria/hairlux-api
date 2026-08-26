import { bookingDateTimeFromParts } from './booking-datetime.utils';

describe('bookingDateTimeFromParts', () => {
  it('interprets the wall-clock time as Africa/Lagos (UTC+1), not server time', () => {
    // 23:30 Lagos on Aug 26 === 22:30 UTC
    expect(bookingDateTimeFromParts('2026-08-26', '23:30').toISOString()).toBe(
      '2026-08-26T22:30:00.000Z',
    );
  });

  it('handles midnight and early-morning times (previous UTC day)', () => {
    expect(bookingDateTimeFromParts('2026-08-26', '00:00').toISOString()).toBe(
      '2026-08-25T23:00:00.000Z',
    );
    expect(bookingDateTimeFromParts('2026-08-26', '00:15').toISOString()).toBe(
      '2026-08-25T23:15:00.000Z',
    );
  });

  it('supports HH:MM:SS input by ignoring seconds', () => {
    expect(
      bookingDateTimeFromParts('2026-08-26', '09:05:30').toISOString(),
    ).toBe('2026-08-26T08:05:00.000Z');
  });

  it('is deterministic regardless of fractional input padding', () => {
    expect(bookingDateTimeFromParts('2026-01-01', '9:07').toISOString()).toBe(
      '2026-01-01T08:07:00.000Z',
    );
  });

  it('rejects malformed date or time parts', () => {
    expect(() => bookingDateTimeFromParts('26-08-2026', '09:00')).toThrow();
    expect(() => bookingDateTimeFromParts('2026-08-26', '')).toThrow();
    expect(() => bookingDateTimeFromParts('', '09:00')).toThrow();
    expect(() => bookingDateTimeFromParts('2026-08-26', '25:00')).toThrow();
    expect(() => bookingDateTimeFromParts('2026-08-26', '09:75')).toThrow();
    expect(() =>
      bookingDateTimeFromParts('2026-08-26', '09:00:00:00'),
    ).toThrow();
  });
});
