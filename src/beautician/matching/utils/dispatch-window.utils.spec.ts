import {
  computeDispatchDelayMs,
  DEFAULT_DISPATCH_LEAD_TIME_MINUTES,
  getDispatchLeadTimeMinutes,
  getDispatchWindowOpenAt,
  isDispatchWindowOpen,
} from './dispatch-window.utils';

describe('dispatch-window.utils', () => {
  const original = process.env.DISPATCH_LEAD_TIME_MINUTES;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DISPATCH_LEAD_TIME_MINUTES;
    } else {
      process.env.DISPATCH_LEAD_TIME_MINUTES = original;
    }
  });

  describe('getDispatchLeadTimeMinutes', () => {
    it('defaults to 0 when unset', () => {
      delete process.env.DISPATCH_LEAD_TIME_MINUTES;
      expect(getDispatchLeadTimeMinutes()).toBe(
        DEFAULT_DISPATCH_LEAD_TIME_MINUTES,
      );
    });

    it('parses a valid env value', () => {
      process.env.DISPATCH_LEAD_TIME_MINUTES = '30';
      expect(getDispatchLeadTimeMinutes()).toBe(30);
    });

    it('falls back to default for invalid or negative values', () => {
      process.env.DISPATCH_LEAD_TIME_MINUTES = 'abc';
      expect(getDispatchLeadTimeMinutes()).toBe(
        DEFAULT_DISPATCH_LEAD_TIME_MINUTES,
      );
      process.env.DISPATCH_LEAD_TIME_MINUTES = '-5';
      expect(getDispatchLeadTimeMinutes()).toBe(
        DEFAULT_DISPATCH_LEAD_TIME_MINUTES,
      );
    });
  });

  describe('computeDispatchDelayMs', () => {
    it('is 0 once the scheduled time has passed', () => {
      process.env.DISPATCH_LEAD_TIME_MINUTES = '0';
      const now = new Date('2026-08-12T10:00:00Z');
      const past = new Date('2026-08-12T09:00:00Z');
      expect(computeDispatchDelayMs(past, now)).toBe(0);
    });

    it('delays until the scheduled time with default lead time', () => {
      process.env.DISPATCH_LEAD_TIME_MINUTES = '0';
      const now = new Date('2026-08-12T10:00:00Z');
      const future = new Date('2026-08-12T11:00:00Z');
      expect(computeDispatchDelayMs(future, now)).toBe(60 * 60 * 1000);
    });

    it('opens the window lead time before the scheduled time', () => {
      process.env.DISPATCH_LEAD_TIME_MINUTES = '15';
      const now = new Date('2026-08-12T10:00:00Z');
      const inTenMinutes = new Date('2026-08-12T10:10:00Z');
      expect(computeDispatchDelayMs(inTenMinutes, now)).toBe(0);
      expect(isDispatchWindowOpen(inTenMinutes, now)).toBe(true);

      const inThirtyMinutes = new Date('2026-08-12T10:30:00Z');
      expect(isDispatchWindowOpen(inThirtyMinutes, now)).toBe(false);
      expect(getDispatchWindowOpenAt(now)).toEqual(
        new Date('2026-08-12T10:15:00Z'),
      );
    });
  });
});
