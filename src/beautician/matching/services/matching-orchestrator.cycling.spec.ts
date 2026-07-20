import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  DispatchStatus,
  MatchingExhaustedReason,
} from '@prisma/client';
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
import { MatchingLockService } from './matching-lock.service';
import { MatchingQueueService } from './matching-queue.service';
import { BookingCoordinatesService } from './booking-coordinates.service';
import { OfferLifecycleService } from './offer-lifecycle.service';
import { MatchingAttemptService } from './matching-attempt.service';
import { CandidatePoolAnalyzerService } from './candidate-pool-analyzer.service';
import { MatchingExhaustionResolverService } from './matching-exhaustion-resolver.service';

describe('MatchingOrchestratorService cycling', () => {
  let service: MatchingOrchestratorService;

  const bookingId = 'booking-1';

  const booking = {
    id: bookingId,
    status: BookingStatus.PENDING_ASSIGNMENT,
    matchingAttempt: 1,
    matchingExhaustedAt: null,
    dispatchStatus: DispatchStatus.PENDING_MATCH,
    bookingType: 'HOME_SERVICE',
    totalAmount: 100,
    services: [
      {
        serviceId: 'service-1',
        name: 'Braids',
        price: 100,
        quantity: 1,
        duration: 60,
        serviceMode: 'HOME_SERVICE',
      },
    ],
    address: {
      latitude: 6.5,
      longitude: 3.3,
      fullAddress: 'Lagos',
      placeId: null,
    },
  };

  // isOnJob optional for mocks if not set on all fixtures
  const candidateB = {
    userId: 'beautician-b',
    profileId: 'profile-b',
    distanceKm: 2,
    score: 0.9,
    scoreSnapshot: {},
  };

  const candidateC = {
    userId: 'beautician-c',
    profileId: 'profile-c',
    distanceKm: 3,
    score: 0.8,
    scoreSnapshot: {},
  };

  let lastOffered: string | null = null;
  let nextCandidate: typeof candidateB | typeof candidateC | null = candidateB;

  const mockPrisma = {
    booking: {
      findUnique: jest.fn(async () => booking),
      update: jest.fn(async () => booking),
    },
    jobOffer: {
      count: jest.fn(async () => 0),
    },
  };

  const mockCandidateFinder = {
    getNextCandidate: jest.fn(async () => nextCandidate),
    getTopCandidates: jest.fn(async ({ limit }: { limit: number }) =>
      nextCandidate ? [nextCandidate].slice(0, limit) : [],
    ),
  };

  const mockOfferExclusion = {
    getExcludedBeauticianIds: jest.fn(async () =>
      lastOffered === 'beautician-c'
        ? []
        : lastOffered === 'beautician-b-declined'
          ? ['beautician-b']
          : [],
    ),
    getDeclinedBeauticianIds: jest.fn(async () =>
      lastOffered === 'beautician-b-declined' ? ['beautician-b'] : [],
    ),
    getLastOfferedBeauticianUserId: jest.fn(async () => lastOffered),
  };

  const mockOfferManager = {
    createNextOffer: jest.fn(async () => {
      if (nextCandidate?.userId === 'beautician-b') {
        lastOffered = 'beautician-b';
        nextCandidate = candidateC;
      } else if (nextCandidate?.userId === 'beautician-c') {
        lastOffered = 'beautician-c';
        nextCandidate = candidateB;
      }
      return { id: `offer-${lastOffered}` };
    }),
  };

  // concurrent default 1 in tests unless overridden

  const mockDispatchState = {
    transition: jest.fn(async () => ({ applied: true })),
    recordEvent: jest.fn(async () => undefined),
  };

  const defaultPoolAnalyze = async ({
    excludeBeauticianUserIds,
  }: {
    excludeBeauticianUserIds: string[];
  }) => {
    if (excludeBeauticianUserIds.length > 0) {
      return {
        onlineEligibleCount: 0,
        freshLocationCount: 0,
        inTierRadiusCount: 0,
        inMaxRadiusCount: 0,
      };
    }

    return {
      onlineEligibleCount: 2,
      freshLocationCount: 2,
      inTierRadiusCount: 2,
      inMaxRadiusCount: 2,
    };
  };

  const mockPoolAnalyzer = {
    analyze: jest.fn(defaultPoolAnalyze),
  };

  const mockMatchingQueue = {
    scheduleCreateOffers: jest.fn(async () => undefined),
    cancelBookingJobs: jest.fn(async () => undefined),
    removeExpireOfferJob: jest.fn(async () => undefined),
    scheduleExpireOffer: jest.fn(async () => undefined),
  };

  const mockRedis = {
    setNx: jest.fn(async () => true),
    incr: jest.fn(async () => 1),
    expire: jest.fn(async () => undefined),
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    del: jest.fn(async () => undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    lastOffered = null;
    nextCandidate = candidateB;
    mockPoolAnalyzer.analyze.mockImplementation(defaultPoolAnalyze);
    mockRedis.incr.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingOrchestratorService,
        MatchingAttemptService,
        {
          provide: OfferLifecycleService,
          useValue: {
            hasActiveOffers: jest.fn(async () => false),
            countActiveOffers: jest.fn(async () => 0),
            expireOffer: jest.fn(),
            expireStaleOffersForBooking: jest.fn(async () => 0),
            cancelBeauticianPendingOffers: jest.fn(async () => []),
            clearActiveOffersAndJobs: jest.fn(),
          },
        },
        {
          provide: MatchingLockService,
          useValue: {
            runExclusive: jest.fn(
              async (_id: string, fn: () => Promise<void>) => fn(),
            ),
            acquire: jest.fn(async () => true),
            release: jest.fn(async () => undefined),
          },
        },
        { provide: MatchingQueueService, useValue: mockMatchingQueue },
        {
          provide: BookingCoordinatesService,
          useValue: {
            resolve: jest.fn(async () => ({ lat: 6.5, lng: 3.3 })),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: HomeServiceSettingsService,
          useValue: {
            getSettings: jest.fn(async () => ({ commissionRate: 0.7 })),
          },
        },
        {
          provide: MatchingConfigService,
          useValue: {
            getMaxAttempts: () => 3,
            resolveRadiusKm: () => 10,
            getOfferTtlSeconds: () => 60,
            getInterTierDelaySeconds: () => 15,
            getMaxRadiusKm: () => 20,
            isWakeExhaustedOnOnlineEnabled: () => false,
            getConcurrentOffers: () => 1,
          },
        },
        { provide: CandidateFinderService, useValue: mockCandidateFinder },
        { provide: CandidatePoolAnalyzerService, useValue: mockPoolAnalyzer },
        MatchingExhaustionResolverService,
        { provide: OfferExclusionService, useValue: mockOfferExclusion },
        { provide: OfferManagerService, useValue: mockOfferManager },
        { provide: DispatchStateService, useValue: mockDispatchState },
        { provide: RedisService, useValue: mockRedis },
        {
          provide: EarningsCalculatorService,
          useClass: EarningsCalculatorService,
        },
        {
          provide: ServiceCommissionRateService,
          useValue: {
            getRateMapForServiceIds: jest.fn(async () => new Map()),
          },
        },
      ],
    }).compile();

    service = module.get(MatchingOrchestratorService);
  });

  it('cycles B -> C -> B when offers expire without exclusion', async () => {
    await service.continueMatching(bookingId, 1);
    expect(mockOfferManager.createNextOffer).toHaveBeenLastCalledWith(
      expect.objectContaining({ candidate: candidateB }),
    );

    await service.continueMatching(bookingId, 1);
    expect(mockOfferManager.createNextOffer).toHaveBeenLastCalledWith(
      expect.objectContaining({ candidate: candidateC }),
    );

    await service.continueMatching(bookingId, 1);
    expect(mockOfferManager.createNextOffer).toHaveBeenLastCalledWith(
      expect.objectContaining({ candidate: candidateB }),
    );
  });

  it('retries on the same tier instead of exhausting when nobody is online', async () => {
    nextCandidate = null;
    mockPoolAnalyzer.analyze.mockImplementation(async () => ({
      onlineEligibleCount: 0,
      freshLocationCount: 0,
      inTierRadiusCount: 0,
      inMaxRadiusCount: 0,
    }));

    await service.continueMatching(bookingId, 1);

    expect(mockMatchingQueue.scheduleCreateOffers).toHaveBeenCalledWith(
      { bookingId, matchingAttempt: 1 },
      expect.objectContaining({
        delayMs: 15_000,
        jobId: `matching-wait-online:${bookingId}:1`,
      }),
    );
    expect(mockDispatchState.transition).not.toHaveBeenCalledWith(
      bookingId,
      expect.objectContaining({ to: DispatchStatus.MATCH_EXHAUSTED }),
    );
  });

  it('exhausts only when all eligible beauticians have declined', async () => {
    nextCandidate = null;
    lastOffered = 'beautician-b-declined';

    await service.continueMatching(bookingId, 1);

    expect(mockDispatchState.transition).toHaveBeenCalledWith(
      bookingId,
      expect.objectContaining({
        to: DispatchStatus.MATCH_EXHAUSTED,
        matchingExhaustedReason: MatchingExhaustedReason.OFFERS_NOT_ACCEPTED,
      }),
    );
  });
});
