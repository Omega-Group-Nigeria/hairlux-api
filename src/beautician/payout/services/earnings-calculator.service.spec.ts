import { BookingType } from '@prisma/client';
import { EarningsCalculatorService } from './earnings-calculator.service';

describe('EarningsCalculatorService', () => {
  let service: EarningsCalculatorService;

  beforeEach(() => {
    service = new EarningsCalculatorService();
  });

  it('applies platform default rate when no service overrides exist', () => {
    const result = service.calculate({
      bookingType: BookingType.HOME_SERVICE,
      services: [
        {
          serviceId: 'svc-a',
          name: 'Braids',
          price: 10000,
          quantity: 1,
          duration: 60,
          serviceMode: BookingType.HOME_SERVICE,
        },
      ],
      totalAmount: 10000,
      defaultCommissionRate: 0.7,
    });

    expect(result.earningsBaseAmount).toBe(10000);
    expect(result.earningsAmount).toBe(7000);
    expect(result.commissionRate).toBe(0.7);
    expect(result.defaultCommissionRate).toBe(0.7);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      serviceId: 'svc-a',
      commissionRate: 0.7,
      earningsAmount: 7000,
    });
  });

  it('uses per-service override and falls back to default for other lines', () => {
    const result = service.calculate({
      bookingType: BookingType.HOME_SERVICE,
      services: [
        {
          serviceId: 'svc-luxury',
          name: 'Luxury',
          price: 1_000_000,
          quantity: 1,
          duration: 300,
          serviceMode: BookingType.HOME_SERVICE,
        },
        {
          serviceId: 'svc-basic',
          name: 'Basic',
          price: 20000,
          quantity: 1,
          duration: 60,
          serviceMode: BookingType.HOME_SERVICE,
        },
      ],
      totalAmount: 1_020_000,
      defaultCommissionRate: 0.1,
      serviceCommissionRates: new Map([['svc-luxury', 0.03]]),
    });

    expect(result.lines).toEqual([
      {
        serviceId: 'svc-luxury',
        lineAmount: 1_000_000,
        commissionRate: 0.03,
        earningsAmount: 30_000,
      },
      {
        serviceId: 'svc-basic',
        lineAmount: 20_000,
        commissionRate: 0.1,
        earningsAmount: 2_000,
      },
    ]);
    expect(result.earningsBaseAmount).toBe(1_020_000);
    expect(result.earningsAmount).toBe(32_000);
  });

  it('uses only home-service lines for MIXED bookings', () => {
    const result = service.calculate({
      bookingType: BookingType.MIXED,
      services: [
        {
          serviceId: 'svc-walk',
          name: 'Walk-in',
          price: 5000,
          quantity: 1,
          duration: 30,
          serviceMode: BookingType.WALK_IN,
        },
        {
          serviceId: 'svc-home',
          name: 'Home',
          price: 8000,
          quantity: 1,
          duration: 120,
          serviceMode: BookingType.HOME_SERVICE,
        },
      ],
      totalAmount: 13000,
      defaultCommissionRate: 0.7,
      serviceCommissionRates: new Map([['svc-home', 0.5]]),
    });

    expect(result.earningsBaseAmount).toBe(8000);
    expect(result.earningsAmount).toBe(4000);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].serviceId).toBe('svc-home');
  });

  it('falls back to totalAmount × default when service lines are empty', () => {
    const result = service.calculate({
      bookingType: BookingType.HOME_SERVICE,
      services: [],
      totalAmount: 50000,
      defaultCommissionRate: 0.2,
    });

    expect(result.earningsBaseAmount).toBe(50000);
    expect(result.earningsAmount).toBe(10000);
    expect(result.lines).toEqual([]);
  });
});
