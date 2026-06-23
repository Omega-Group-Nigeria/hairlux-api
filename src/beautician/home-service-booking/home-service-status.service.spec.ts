import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { HomeServiceStatusService } from './home-service-status.service';

describe('HomeServiceStatusService', () => {
  let service: HomeServiceStatusService;

  beforeEach(() => {
    service = new HomeServiceStatusService();
  });

  it('allows assigned to en route transition', () => {
    expect(
      service.canTransition(BookingStatus.ASSIGNED, BookingStatus.EN_ROUTE),
    ).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(() =>
      service.assertTransition(BookingStatus.ASSIGNED, BookingStatus.COMPLETED),
    ).toThrow(BadRequestException);
  });

  it('calculates booked duration with quantity', () => {
    const duration = service.calculateBookedDurationMinutes([
      {
        serviceId: 'svc-1',
        name: 'Braids',
        price: 100,
        quantity: 2,
        duration: 60,
      },
    ]);

    expect(duration).toBe(120);
  });
});