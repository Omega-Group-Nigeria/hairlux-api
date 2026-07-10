import { BadRequestException } from '@nestjs/common';
import { DailyPayoutLimitService } from './daily-payout-limit.service';

describe('DailyPayoutLimitService', () => {
  let service: DailyPayoutLimitService;

  const mockPrisma = {
    homeServiceSettings: {
      findFirst: jest.fn(),
    },
    payoutRequest: {
      aggregate: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DailyPayoutLimitService(mockPrisma as never);
  });

  describe('getStartOfDayInTimezone', () => {
    it('returns Lagos midnight for a known UTC instant', () => {
      // 2026-07-10 12:00 UTC → still 2026-07-10 in Lagos (UTC+1)
      const now = new Date('2026-07-10T12:00:00.000Z');
      const start = service.getStartOfDayInTimezone('Africa/Lagos', now);

      // Local Lagos midnight 2026-07-10 is 2026-07-09T23:00:00.000Z
      expect(start.toISOString()).toBe('2026-07-09T23:00:00.000Z');
    });

    it('rolls over after Lagos midnight', () => {
      // 2026-07-10 00:30 Lagos = 2026-07-09T23:30:00.000Z → still July 10 Lagos day
      const justAfterMidnight = new Date('2026-07-09T23:30:00.000Z');
      const start = service.getStartOfDayInTimezone(
        'Africa/Lagos',
        justAfterMidnight,
      );
      expect(start.toISOString()).toBe('2026-07-09T23:00:00.000Z');

      // 2026-07-09 23:30 Lagos = 2026-07-09T22:30:00.000Z → still July 9
      const beforeMidnight = new Date('2026-07-09T22:30:00.000Z');
      const prevStart = service.getStartOfDayInTimezone(
        'Africa/Lagos',
        beforeMidnight,
      );
      expect(prevStart.toISOString()).toBe('2026-07-08T23:00:00.000Z');
    });
  });

  describe('getPoolStatus', () => {
    it('reports unlimited when limit is null', async () => {
      mockPrisma.homeServiceSettings.findFirst.mockResolvedValueOnce({
        dailyPayoutLimit: null,
      });
      mockPrisma.payoutRequest.aggregate.mockResolvedValueOnce({
        _sum: { amount: 50000 },
      });

      const status = await service.getPoolStatus();

      expect(status.unlimited).toBe(true);
      expect(status.limit).toBeNull();
      expect(status.used).toBe(50000);
      expect(status.remaining).toBeNull();
      expect(status.timezone).toBe('Africa/Lagos');
    });

    it('computes remaining capacity', async () => {
      mockPrisma.homeServiceSettings.findFirst.mockResolvedValueOnce({
        dailyPayoutLimit: 100000,
      });
      mockPrisma.payoutRequest.aggregate.mockResolvedValueOnce({
        _sum: { amount: 40000 },
      });

      const status = await service.getPoolStatus();

      expect(status.unlimited).toBe(false);
      expect(status.limit).toBe(100000);
      expect(status.used).toBe(40000);
      expect(status.remaining).toBe(60000);
    });
  });

  describe('assertWithinDailyLimit', () => {
    it('allows when unlimited', async () => {
      mockPrisma.homeServiceSettings.findFirst.mockResolvedValueOnce({
        dailyPayoutLimit: null,
      });
      mockPrisma.payoutRequest.aggregate.mockResolvedValueOnce({
        _sum: { amount: 999999 },
      });

      await expect(service.assertWithinDailyLimit(50000)).resolves.toBeUndefined();
    });

    it('allows when within remaining capacity', async () => {
      mockPrisma.homeServiceSettings.findFirst.mockResolvedValueOnce({
        dailyPayoutLimit: 100000,
      });
      mockPrisma.payoutRequest.aggregate.mockResolvedValueOnce({
        _sum: { amount: 40000 },
      });

      await expect(service.assertWithinDailyLimit(60000)).resolves.toBeUndefined();
    });

    it('rejects when amount would exceed limit', async () => {
      mockPrisma.homeServiceSettings.findFirst.mockResolvedValue({
        dailyPayoutLimit: 100000,
      });
      mockPrisma.payoutRequest.aggregate.mockResolvedValue({
        _sum: { amount: 90000 },
      });

      await expect(service.assertWithinDailyLimit(15000)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      try {
        await service.assertWithinDailyLimit(15000);
        fail('expected BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(
          "This withdrawal can't be processed right now. Please try again tomorrow.",
        );
      }
    });

    it('passes excludePayoutRequestId into aggregate filter', async () => {
      mockPrisma.homeServiceSettings.findFirst.mockResolvedValueOnce({
        dailyPayoutLimit: 100000,
      });
      mockPrisma.payoutRequest.aggregate.mockResolvedValueOnce({
        _sum: { amount: 0 },
      });

      await service.assertWithinDailyLimit(5000, 'payout-existing');

      expect(mockPrisma.payoutRequest.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'payout-existing' },
          }),
        }),
      );
    });
  });
});
