import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { MatchingOrchestratorService } from './matching-orchestrator.service';
import { MatchingConfigService } from './matching-config.service';
import { CandidateFinderService } from './candidate-finder.service';
import { OfferExclusionService } from './offer-exclusion.service';
import { OfferManagerService } from './offer-manager.service';
import { DispatchStateService } from './dispatch-state.service';
import { RedisService } from '../../../redis/redis.service';
import { EarningsCalculatorService } from '../../payout/services/earnings-calculator.service';
import { ServiceCommissionRateService } from '../../payout/services/service-commission-rate.service';
import { BeauticianCommissionRateService } from '../../payout/services/beautician-commission-rate.service';
import { MatchingLockService } from './matching-lock.service';
import { MatchingQueueService } from './matching-queue.service';
import { BookingCoordinatesService } from './booking-coordinates.service';
import { OfferLifecycleService } from './offer-lifecycle.service';
import { MatchingAttemptService } from './matching-attempt.service';
import { matchingJobIds } from '../constants/matching-queue.constants';

describe('MatchingOrchestratorService scheduled dispatch', () => {
  let service: MatchingOrchestratorService;

  const bookingId = 'booking-1';
  const original = process.env.DISPATCH_LEAD_TIME_MINUTES;

  const scheduleCreateOffers = jest.fn(async () => undefined);
  const findUnique = jest.fn(async () => null);
  const runExclusive = jest.fn(async () => null);

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.DISPATCH_LEAD_TIME_MINUTES = '0';
    scheduleCreateOffers.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingOrchestratorService,
        { provide: PrismaService, useValue: { booking: { findUnique } } },
        { provide: HomeServiceSettingsService, useValue: {} },
        { provide: MatchingConfigService, useValue: {} },
        { provide: CandidateFinderService, useValue: {} },
        { provide: OfferExclusionService, useValue: {} },
        { provide: OfferManagerService, useValue: {} },
        { provide: DispatchStateService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: EarningsCalculatorService, useValue: {} },
        { provide: ServiceCommissionRateService, useValue: {} },
        { provide: BeauticianCommissionRateService, useValue: {} },
        { provide: MatchingLockService, useValue: { runExclusive } },
        {
          provide: MatchingQueueService,
          useValue: { scheduleCreateOffers },
        },
        { provide: BookingCoordinatesService, useValue: {} },
        { provide: OfferLifecycleService, useValue: {} },
        { provide: MatchingAttemptService, useValue: {} },
      ],
    }).compile();

    service = module.get<MatchingOrchestratorService>(
      MatchingOrchestratorService,
    );
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DISPATCH_LEAD_TIME_MINUTES;
    } else {
      process.env.DISPATCH_LEAD_TIME_MINUTES = original;
    }
  });

  it('schedules the first dispatch with a delay for a future-dated booking', async () => {
    const bookingDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await service.scheduleInitialDispatch(bookingId, bookingDate);

    expect(scheduleCreateOffers).toHaveBeenCalledWith(
      { bookingId, matchingAttempt: 1 },
      {
        jobId: matchingJobIds.scheduledDispatch(bookingId),
        delayMs: expect.any(Number),
      },
    );
    const delay = scheduleCreateOffers.mock.calls[0][1].delayMs;
    expect(delay).toBeGreaterThan(0);
  });

  it('re-schedules instead of dispatching when the window has not opened', async () => {
    findUnique.mockResolvedValue({
      id: bookingId,
      status: BookingStatus.PENDING_ASSIGNMENT,
      bookingDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
      matchingExhaustedAt: null,
      matchingStartedAt: null,
    });

    await service.createOffersForBooking(bookingId, 1);

    expect(scheduleCreateOffers).toHaveBeenCalledWith(
      { bookingId, matchingAttempt: 1 },
      {
        jobId: matchingJobIds.scheduledDispatch(bookingId),
        delayMs: expect.any(Number),
      },
    );
    expect(runExclusive).not.toHaveBeenCalled();
  });

  it('proceeds to matching once the window is open', async () => {
    findUnique.mockResolvedValue({
      id: bookingId,
      status: BookingStatus.PENDING_ASSIGNMENT,
      bookingDate: new Date(Date.now() - 60_000),
      matchingExhaustedAt: null,
      matchingStartedAt: new Date(),
    });
    runExclusive.mockResolvedValue(null);

    await service.createOffersForBooking(bookingId, 1);

    expect(scheduleCreateOffers).not.toHaveBeenCalled();
    expect(runExclusive).toHaveBeenCalled();
  });
});
