import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import {
  BookingStatus,
  DispatchStatus,
  MatchingExhaustedReason,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { GeocodingService } from '../../../common/services/geocoding.service';
import { HOME_SERVICE_MATCHING_QUEUE } from '../../home-service-booking/home-service-booking.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { MatchingOrchestratorService } from './matching-orchestrator.service';
import { MatchingConfigService } from './matching-config.service';
import { CandidateFinderService } from './candidate-finder.service';
import { CandidatePoolAnalyzerService } from './candidate-pool-analyzer.service';
import { MatchingExhaustionResolverService } from './matching-exhaustion-resolver.service';
import { OfferExclusionService } from './offer-exclusion.service';
import { OfferManagerService } from './offer-manager.service';
import { DispatchStateService } from './dispatch-state.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';
import { RedisService } from '../../../redis/redis.service';

describe('MatchingOrchestratorService cycling', () => {
  let service: MatchingOrchestratorService;

  const bookingId = 'booking-1';
  const queueAdd = jest.fn();

  const booking = {
    id: bookingId,
    status: BookingStatus.PENDING_ASSIGNMENT,
    matchingAttempt: 1,
    matchingExhaustedAt: null,
    dispatchStatus: DispatchStatus.PENDING_MATCH,
    services: [
      {
        serviceId: 'service-1',
        serviceName: 'Braids',
        price: 100,
        bookingType: 'HOME_SERVICE',
      },
    ],
    address: {
      latitude: 6.5,
      longitude: 3.3,
      fullAddress: 'Lagos',
    },
  };

  const candidateB = {
    userId: 'beautician-b',
    profileId: 'profile-b',
    distanceKm: 2,
    commissionRateOverride: null,
    score: 0.9,
    scoreSnapshot: {},
  };

  const candidateC = {
    userId: 'beautician-c',
    profileId: 'profile-c',
    distanceKm: 3,
    commissionRateOverride: null,
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

  beforeEach(async () => {
    jest.clearAllMocks();
    lastOffered = null;
    nextCandidate = candidateB;
    mockPoolAnalyzer.analyze.mockImplementation(defaultPoolAnalyze);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingOrchestratorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeocodingService, useValue: { geocodeAddress: jest.fn() } },
        {
          provide: HomeServiceSettingsService,
          useValue: { getSettings: jest.fn(async () => ({ commissionRate: 0.7 })) },
        },
        {
          provide: MatchingConfigService,
          useValue: {
            getMaxAttempts: () => 3,
            resolveRadiusKm: () => 10,
            getOfferTtlSeconds: () => 60,
            getInterTierDelaySeconds: () => 15,
            getMaxRadiusKm: () => 20,
          },
        },
        { provide: CandidateFinderService, useValue: mockCandidateFinder },
        { provide: CandidatePoolAnalyzerService, useValue: mockPoolAnalyzer },
        MatchingExhaustionResolverService,
        { provide: OfferExclusionService, useValue: mockOfferExclusion },
        { provide: OfferManagerService, useValue: mockOfferManager },
        { provide: DispatchStateService, useValue: mockDispatchState },
        {
          provide: RealtimePublisherService,
          useValue: { emitOfferExpired: jest.fn() },
        },
        { provide: RedisService, useValue: { setNx: jest.fn() } },
        {
          provide: getQueueToken(HOME_SERVICE_MATCHING_QUEUE),
          useValue: { add: queueAdd, getJobs: jest.fn(async () => []) },
        },
      ],
    }).compile();

    service = module.get<MatchingOrchestratorService>(
      MatchingOrchestratorService,
    );
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

    expect(queueAdd).toHaveBeenCalledWith(
      'create-offers',
      { bookingId, matchingAttempt: 1 },
      expect.objectContaining({ delay: 15_000 }),
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