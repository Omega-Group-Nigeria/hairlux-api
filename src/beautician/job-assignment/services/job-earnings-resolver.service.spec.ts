import { BookingType } from '@prisma/client';
import { JobEarningsResolverService } from './job-earnings-resolver.service';
import { EarningsCalculatorService } from '../../payout/services/earnings-calculator.service';

describe('JobEarningsResolverService', () => {
  let service: JobEarningsResolverService;

  const mockPrisma = {
    jobOffer: {
      findMany: jest.fn(),
    },
  };

  const mockSettingsService = {
    getSettings: jest.fn(),
  };

  const mockServiceCommissionRates = {
    getRateMapForServiceIds: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JobEarningsResolverService(
      mockPrisma as never,
      mockSettingsService as never,
      new EarningsCalculatorService(),
      mockServiceCommissionRates as never,
    );
  });

  it('prefers accepted offer snapshot over recalculated earnings', async () => {
    mockSettingsService.getSettings.mockResolvedValue({ commissionRate: 0.7 });
    mockServiceCommissionRates.getRateMapForServiceIds.mockResolvedValue(
      new Map(),
    );
    mockPrisma.jobOffer.findMany.mockResolvedValue([
      {
        bookingId: 'booking-1',
        estEarningsAtOffer: 35000,
      },
    ]);

    const result = await service.resolveForActiveBookings('beautician-1', [
      {
        id: 'booking-1',
        bookingType: BookingType.HOME_SERVICE,
        services: [
          {
            serviceId: 'svc-1',
            name: 'BIG BRAIDS',
            price: 50000,
            quantity: 1,
            duration: 200,
            serviceMode: BookingType.HOME_SERVICE,
          },
        ],
        totalAmount: 50000,
      },
    ]);

    expect(result.get('booking-1')).toEqual({
      payoutAmount: 35000,
      commissionRate: 0.7,
    });
  });

  it('calculates with service override and default fallback when no offer snapshot', async () => {
    mockSettingsService.getSettings.mockResolvedValue({ commissionRate: 0.1 });
    mockServiceCommissionRates.getRateMapForServiceIds.mockResolvedValue(
      new Map([['svc-luxury', 0.03]]),
    );
    mockPrisma.jobOffer.findMany.mockResolvedValue([]);

    const result = await service.resolveForActiveBookings('beautician-1', [
      {
        id: 'booking-2',
        bookingType: BookingType.HOME_SERVICE,
        services: [
          {
            serviceId: 'svc-luxury',
            name: 'Luxury',
            price: 1_000_000,
            quantity: 1,
            duration: 240,
            serviceMode: BookingType.HOME_SERVICE,
          },
          {
            serviceId: 'svc-basic',
            name: 'Basic',
            price: 20_000,
            quantity: 1,
            duration: 60,
            serviceMode: BookingType.HOME_SERVICE,
          },
        ],
        totalAmount: 1_020_000,
      },
    ]);

    expect(result.get('booking-2')).toEqual({
      payoutAmount: 32_000,
      commissionRate: expect.any(Number),
    });
    expect(result.get('booking-2')!.commissionRate).toBeCloseTo(
      32000 / 1_020_000,
      4,
    );
  });
});
