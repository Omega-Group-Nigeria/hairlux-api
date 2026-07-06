import { BookingType } from '@prisma/client';
import { JobEarningsResolverService } from './job-earnings-resolver.service';
import { EarningsCalculatorService } from '../../payout/services/earnings-calculator.service';

describe('JobEarningsResolverService', () => {
  let service: JobEarningsResolverService;

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
    },
    jobOffer: {
      findMany: jest.fn(),
    },
  };

  const mockSettingsService = {
    getSettings: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JobEarningsResolverService(
      mockPrisma as never,
      mockSettingsService as never,
      new EarningsCalculatorService(),
    );
  });

  it('prefers accepted offer snapshot over recalculated earnings', async () => {
    mockSettingsService.getSettings.mockResolvedValue({ commissionRate: 0.7 });
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      commissionRateOverride: null,
    });
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

  it('calculates payout from settings when no accepted offer snapshot exists', async () => {
    mockSettingsService.getSettings.mockResolvedValue({ commissionRate: 0.7 });
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      commissionRateOverride: null,
    });
    mockPrisma.jobOffer.findMany.mockResolvedValue([]);

    const result = await service.resolveForActiveBookings('beautician-1', [
      {
        id: 'booking-2',
        bookingType: BookingType.HOME_SERVICE,
        services: [],
        totalAmount: 50000,
      },
    ]);

    expect(result.get('booking-2')).toEqual({
      payoutAmount: 35000,
      commissionRate: 0.7,
    });
  });
});