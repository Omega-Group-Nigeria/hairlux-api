import { BookingType } from '@prisma/client';
import { EarningsCalculatorService } from './earnings-calculator.service';

describe('EarningsCalculatorService', () => {
  let service: EarningsCalculatorService;

  beforeEach(() => {
    service = new EarningsCalculatorService();
  });

  it('applies commission rate to full amount for home service bookings', () => {
    const result = service.calculate({
      bookingType: BookingType.HOME_SERVICE,
      services: [],
      totalAmount: 10000,
      commissionRate: 0.7,
    });

    expect(result.earningsAmount).toBe(7000);
    expect(result.earningsBaseAmount).toBe(10000);
  });

  it('uses only home service lines for mixed bookings', () => {
    const result = service.calculate({
      bookingType: BookingType.MIXED,
      services: [
        {
          serviceId: 'svc-1',
          name: 'Walk-in cut',
          price: 5000,
          quantity: 1,
          duration: 30,
          serviceMode: BookingType.WALK_IN,
        },
        {
          serviceId: 'svc-2',
          name: 'Home braids',
          price: 8000,
          quantity: 1,
          duration: 120,
          serviceMode: BookingType.HOME_SERVICE,
        },
      ],
      totalAmount: 13000,
      commissionRate: 0.7,
    });

    expect(result.earningsBaseAmount).toBe(8000);
    expect(result.earningsAmount).toBe(5600);
  });

  it('prefers beautician commission override', () => {
    const result = service.calculate({
      bookingType: BookingType.HOME_SERVICE,
      services: [],
      totalAmount: 10000,
      commissionRate: 0.7,
      commissionRateOverride: 0.8,
    });

    expect(result.commissionRate).toBe(0.8);
    expect(result.earningsAmount).toBe(8000);
  });
});