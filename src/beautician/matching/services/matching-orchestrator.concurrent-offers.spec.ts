import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, DispatchStatus } from '@prisma/client';
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
import { CandidatePoolAnalyzerService } from './candidate-pool-analyzer.service';
import { MatchingExhaustionResolverService } from './matching-exhaustion-resolver.service';

describe('MatchingOrchestratorService concurrent offers', () => {
  let service: MatchingOrchestratorService;

  const bookingId = 'booking-concurrent';
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

  const candidates = [
    {
      userId: 'beautician-a',
      profileId: 'profile-a',
      distanceKm: 1,
      score: 10,
      scoreSnapshot: {},
      isOnJob: false,
    },
    {
      userId: 'beautician-b',
      profileId: 'profile-b',
      distanceKm: 2,
      score: 9,
      scoreSnapshot: {},
      isOnJob: false,
    },
    {
      userId: 'beautician-c',
      profileId: 'profile-c',
      distanceKm: 3,
      score: 8,
      scoreSnapshot: {},
      isOnJob: false,
    },
  ];

  let activeOffers = 0;
  let concurrentOffers = 2;

  const mockPrisma = {
    booking: {
      findUnique: jest.fn(async () => booking),
      update: jest.fn(async () => booking),
    },
  };

  const mockOfferLifecycle = {
    hasActiveOffers: jest.fn(async () => activeOffers > 0),
    countActiveOffers: jest.fn(async () => activeOffers),
    expireOffer: jest.fn(),
    expireStaleOffersForBooking: jest.fn(async () => 0),
    cancelBeauticianPendingOffers: jest.fn(async () => []),
    clearActiveOffersAndJobs: jest.fn(),
  };

  const mockCandidateFinder = {
    getTopCandidates: jest.fn(
      async ({ limit }: { limit: number }) => candidates.slice(0, limit),
    ),
    getNextCandidate: jest.fn(async () => candidates[0]),
  };

  const mockOfferManager = {
    createNextOffer: jest.fn(async () => {
      activeOffers += 1;
      return { id: `offer-${activeOffers}` };
    }),
  };

  const mockMatchingAttempts = {
    handleNoCandidate: jest.fn(async () => undefined),
    markMatchingExhausted: jest.fn(async () => undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    activeOffers = 0;
    concurrentOffers = 2;
    mockOfferLifecycle.countActiveOffers.mockImplementation(
      async () => activeOffers,
    );
    mockCandidateFinder.getTopCandidates.mockImplementation(
      async ({ limit }: { limit: number }) => candidates.slice(0, limit),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingOrchestratorService,
        {
          provide: MatchingAttemptService,
          useValue: mockMatchingAttempts,
        },
        { provide: OfferLifecycleService, useValue: mockOfferLifecycle },
        {
          provide: MatchingLockService,
          useValue: {
            runExclusive: jest.fn(
              async (_id: string, fn: () => Promise<void>) => fn(),
            ),
          },
        },
        {
          provide: MatchingQueueService,
          useValue: {
            scheduleCreateOffers: jest.fn(),
            cancelBookingJobs: jest.fn(),
          },
        },
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
            getConcurrentOffers: () => concurrentOffers,
            getMaxRadiusKm: () => 20,
            isWakeExhaustedOnOnlineEnabled: () => false,
          },
        },
        { provide: CandidateFinderService, useValue: mockCandidateFinder },
        {
          provide: CandidatePoolAnalyzerService,
          useValue: { analyze: jest.fn() },
        },
        MatchingExhaustionResolverService,
        {
          provide: OfferExclusionService,
          useValue: {
            getExcludedBeauticianIds: jest.fn(async () => []),
            getLastOfferedBeauticianUserId: jest.fn(async () => null),
            getDeclinedBeauticianIds: jest.fn(async () => []),
          },
        },
        { provide: OfferManagerService, useValue: mockOfferManager },
        {
          provide: DispatchStateService,
          useValue: {
            transition: jest.fn(async () => ({ applied: true })),
            recordEvent: jest.fn(async () => undefined),
          },
        },
        {
          provide: RedisService,
          useValue: {
            setNx: jest.fn(async () => true),
            incr: jest.fn(async () => 1),
            expire: jest.fn(),
            get: jest.fn(async () => null),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
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
        {
          provide: BeauticianCommissionRateService,
          useValue: {
            getRateMapForBeauticianIds: jest.fn(async () => new Map()),
          },
        },
      ],
    }).compile();

    service = module.get(MatchingOrchestratorService);
  });

  it('sends offers to top 2 when concurrent cap is 2 and no active offers', async () => {
    await service.continueMatching(bookingId, 1);

    expect(mockCandidateFinder.getTopCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2 }),
    );
    expect(mockOfferManager.createNextOffer).toHaveBeenCalledTimes(2);
    expect(mockOfferManager.createNextOffer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        candidate: expect.objectContaining({ userId: 'beautician-a' }),
      }),
    );
    expect(mockOfferManager.createNextOffer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        candidate: expect.objectContaining({ userId: 'beautician-b' }),
      }),
    );
    expect(mockMatchingAttempts.handleNoCandidate).not.toHaveBeenCalled();
  });

  it('only fills open slots when one offer is already active (cap 2)', async () => {
    activeOffers = 1;

    await service.continueMatching(bookingId, 1);

    expect(mockCandidateFinder.getTopCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
    expect(mockOfferManager.createNextOffer).toHaveBeenCalledTimes(1);
  });

  it('skips matching when concurrent cap is already full', async () => {
    activeOffers = 2;

    await service.continueMatching(bookingId, 1);

    expect(mockCandidateFinder.getTopCandidates).not.toHaveBeenCalled();
    expect(mockOfferManager.createNextOffer).not.toHaveBeenCalled();
  });

  it('defaults to single offer when concurrent cap is 1', async () => {
    concurrentOffers = 1;

    await service.continueMatching(bookingId, 1);

    expect(mockCandidateFinder.getTopCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
    expect(mockOfferManager.createNextOffer).toHaveBeenCalledTimes(1);
    expect(mockOfferManager.createNextOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({ userId: 'beautician-a' }),
      }),
    );
  });

  it('does not exhaust when no fill candidates but other offers still active', async () => {
    activeOffers = 1;
    mockCandidateFinder.getTopCandidates.mockResolvedValue([]);

    await service.continueMatching(bookingId, 1);

    expect(mockOfferManager.createNextOffer).not.toHaveBeenCalled();
    expect(mockMatchingAttempts.handleNoCandidate).not.toHaveBeenCalled();
  });

  it('handles no-candidate path only when zero active offers and no candidates', async () => {
    activeOffers = 0;
    mockCandidateFinder.getTopCandidates.mockResolvedValue([]);

    await service.continueMatching(bookingId, 1);

    expect(mockMatchingAttempts.handleNoCandidate).toHaveBeenCalledWith(
      bookingId,
      1,
      expect.any(Object),
    );
  });
});
