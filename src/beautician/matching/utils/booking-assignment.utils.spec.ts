import { BookingType } from '@prisma/client';
import {
  bookingNeedsBeauticianAssignment,
  extractHomeServiceIds,
  maskAddress,
  sumHomeServiceAmount,
} from './booking-assignment.utils';

describe('booking-assignment.utils', () => {
  describe('bookingNeedsBeauticianAssignment', () => {
    it('returns true for HOME_SERVICE booking type', () => {
      expect(
        bookingNeedsBeauticianAssignment(BookingType.HOME_SERVICE, []),
      ).toBe(true);
    });

    it('returns true when any service line is HOME_SERVICE', () => {
      expect(
        bookingNeedsBeauticianAssignment(BookingType.MIXED, [
          {
            serviceId: 'svc-1',
            name: 'Braids',
            price: 100,
            quantity: 1,
            duration: 60,
            serviceMode: BookingType.WALK_IN,
          },
          {
            serviceId: 'svc-2',
            name: 'Makeup',
            price: 80,
            quantity: 1,
            duration: 45,
            serviceMode: BookingType.HOME_SERVICE,
          },
        ]),
      ).toBe(true);
    });

    it('returns false for walk-in only bookings', () => {
      expect(
        bookingNeedsBeauticianAssignment(BookingType.WALK_IN, [
          {
            serviceId: 'svc-1',
            name: 'Braids',
            price: 100,
            quantity: 1,
            duration: 60,
            serviceMode: BookingType.WALK_IN,
          },
        ]),
      ).toBe(false);
    });
  });

  describe('extractHomeServiceIds', () => {
    it('deduplicates home service ids and ignores walk-in lines', () => {
      expect(
        extractHomeServiceIds([
          {
            serviceId: 'svc-1',
            name: 'Braids',
            price: 100,
            quantity: 1,
            duration: 60,
            serviceMode: BookingType.HOME_SERVICE,
          },
          {
            serviceId: 'svc-1',
            name: 'Braids',
            price: 100,
            quantity: 1,
            duration: 60,
            serviceMode: BookingType.HOME_SERVICE,
          },
          {
            serviceId: 'svc-2',
            name: 'Cut',
            price: 50,
            quantity: 1,
            duration: 30,
            serviceMode: BookingType.WALK_IN,
          },
        ]),
      ).toEqual(['svc-1']);
    });
  });

  describe('sumHomeServiceAmount', () => {
    it('sums only home service line totals', () => {
      expect(
        sumHomeServiceAmount([
          {
            serviceId: 'svc-1',
            name: 'Braids',
            price: 100,
            quantity: 2,
            duration: 60,
            serviceMode: BookingType.HOME_SERVICE,
          },
          {
            serviceId: 'svc-2',
            name: 'Cut',
            price: 50,
            quantity: 1,
            duration: 30,
            serviceMode: BookingType.WALK_IN,
          },
        ]),
      ).toBe(200);
    });
  });

  describe('maskAddress', () => {
    it('masks to city and state for long addresses', () => {
      expect(
        maskAddress('12 Admiralty Way, Lekki Phase 1, Lagos, Nigeria'),
      ).toBe('Lagos, Nigeria');
    });

    it('returns the last segment for short addresses', () => {
      expect(maskAddress('Lekki, Lagos')).toBe('Lagos');
    });
  });
});