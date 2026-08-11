import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingOrchestratorService } from '../matching/services/matching-orchestrator.service';
import { HomeServiceBookingService } from './home-service-booking.service';

describe('HomeServiceBookingService', () => {
  let service: HomeServiceBookingService;

  const findUnique = jest.fn(async () => null);
  const scheduleInitialDispatch = jest.fn(async () => undefined);
  const original = process.env.DISPATCH_LEAD_TIME_MINUTES;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.DISPATCH_LEAD_TIME_MINUTES = '0';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeServiceBookingService,
        { provide: PrismaService, useValue: { booking: { findUnique } } },
        {
          provide: MatchingOrchestratorService,
          useValue: { scheduleInitialDispatch },
        },
      ],
    }).compile();

    service = module.get<HomeServiceBookingService>(HomeServiceBookingService);
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DISPATCH_LEAD_TIME_MINUTES;
    } else {
      process.env.DISPATCH_LEAD_TIME_MINUTES = original;
    }
  });

  describe('triggerMatching', () => {
    it('schedules dispatch with the booking service time', async () => {
      const bookingDate = new Date('2026-08-15T10:00:00Z');
      findUnique.mockResolvedValue({ bookingDate });

      await service.triggerMatching('booking-1');

      expect(scheduleInitialDispatch).toHaveBeenCalledWith(
        'booking-1',
        bookingDate,
      );
    });

    it('does not schedule when the booking is missing', async () => {
      findUnique.mockResolvedValue(null);
      await service.triggerMatching('missing');

      expect(scheduleInitialDispatch).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentConfirmationMessage', () => {
    it('announces scheduled dispatch for a future-dated booking', () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(
        service.getPaymentConfirmationMessage(
          BookingStatus.PENDING_ASSIGNMENT,
          future,
        ),
      ).toContain('scheduled time');
    });

    it('keeps the searching message for an immediate booking', () => {
      const past = new Date(Date.now() - 60_000);
      expect(
        service.getPaymentConfirmationMessage(
          BookingStatus.PENDING_ASSIGNMENT,
          past,
        ),
      ).not.toContain('scheduled time');
    });

    it('reports exhausted matching when present', () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(
        service.getPaymentConfirmationMessage(
          BookingStatus.PENDING_ASSIGNMENT,
          future,
          new Date(),
          'NO_MATCH',
        ),
      ).not.toContain('scheduled time');
    });
  });
});
