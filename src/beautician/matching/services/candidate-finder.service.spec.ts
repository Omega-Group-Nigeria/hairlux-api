import { AvailabilityStatus, BookingStatus } from '@prisma/client';
import { CandidateFinderService } from './candidate-finder.service';
import { CandidateEligibilityService } from './candidate-eligibility.service';
import { CandidateMetricsService } from './candidate-metrics.service';
import { CandidateScorerService } from './candidate-scorer.service';
import { BeauticianLocationIndexService } from './beautician-location-index.service';
import { MatchingConfigService } from './matching-config.service';

describe('CandidateFinderService dispatch pools', () => {
  let service: CandidateFinderService;

  const freeUser = 'free-user';
  const onJobUser = 'on-job-user';
  const earlyOnJobUser = 'early-on-job-user';
  const serviceId = 'service-braids';

  const freeProfile = {
    id: 'profile-free',
    userId: freeUser,
    currentLat: 6.45,
    currentLng: 3.4,
    lastLocationUpdate: new Date(),
    maxTravelRadiusKm: null,
    ratingAverage: 5,
    availabilityStatus: AvailabilityStatus.ONLINE,
    assignedServices: [{ serviceId }],
  };

  const onJobProfile = {
    id: 'profile-on-job',
    userId: onJobUser,
    currentLat: 6.451,
    currentLng: 3.401,
    lastLocationUpdate: new Date(),
    maxTravelRadiusKm: null,
    ratingAverage: 4.9,
    availabilityStatus: AvailabilityStatus.ON_JOB,
    assignedServices: [{ serviceId }],
  };

  const earlyOnJobProfile = {
    ...onJobProfile,
    id: 'profile-early',
    userId: earlyOnJobUser,
  };

  const mockPrisma = {
    beauticianProfile: {
      findMany: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
    },
  };

  const mockLocationIndex = {
    searchNearby: jest.fn(),
  };

  const mockMetrics = {
    loadMetrics: jest.fn().mockResolvedValue(new Map()),
  };

  const mockScorer = {
    score: jest.fn((distanceKm: number) => ({
      score: 100 - distanceKm * 10,
      snapshot: { distanceKm, score: 100 - distanceKm * 10 },
    })),
  };

  const mockEligibility = {
    coversAllServices: jest.fn().mockReturnValue(true),
    hasFreshLocation: jest.fn().mockReturnValue(true),
    isWithinTierRadius: jest.fn().mockReturnValue(true),
    isWithinBeauticianTravelLimit: jest.fn().mockReturnValue(true),
    isOnJobNearServiceComplete: jest.fn(),
  };

  const mockMatchingConfig = {
    getOnJobOfferEligiblePercent: jest.fn().mockReturnValue(90),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEligibility.coversAllServices.mockReturnValue(true);
    mockEligibility.hasFreshLocation.mockReturnValue(true);
    mockEligibility.isWithinTierRadius.mockReturnValue(true);
    mockEligibility.isWithinBeauticianTravelLimit.mockReturnValue(true);
    mockMetrics.loadMetrics.mockResolvedValue(new Map());
    mockMatchingConfig.getOnJobOfferEligiblePercent.mockReturnValue(90);

    service = new CandidateFinderService(
      mockPrisma as never,
      mockEligibility as never,
      mockMetrics as never,
      mockScorer as never,
      mockLocationIndex as never,
      mockMatchingConfig as never,
    );
  });

  const baseParams = {
    bookingId: 'booking-new',
    matchingAttempt: 1,
    customerLat: 6.45,
    customerLng: 3.4,
    radiusKm: 10,
    requiredServiceIds: [serviceId],
    excludeBeauticianUserIds: [] as string[],
  };

  it('ranks free ONLINE candidates before near-complete ON_JOB candidates', async () => {
    mockLocationIndex.searchNearby.mockResolvedValue([
      { userId: freeUser, distanceKm: 2 },
    ]);
    mockPrisma.beauticianProfile.findMany
      .mockResolvedValueOnce([freeProfile]) // ONLINE pool by status
      .mockResolvedValueOnce([freeProfile]) // free by geo user ids
      .mockResolvedValueOnce([onJobProfile]); // on-job fallback load
    mockPrisma.booking.findMany.mockResolvedValue([
      {
        assignedBeauticianUserId: onJobUser,
        serviceStartedAt: new Date(Date.now() - 95 * 60_000),
        services: [
          {
            serviceId,
            name: 'Braids',
            price: 1,
            quantity: 1,
            duration: 100,
          },
        ],
        status: BookingStatus.IN_PROGRESS,
        updatedAt: new Date(),
      },
    ]);
    mockEligibility.isOnJobNearServiceComplete.mockReturnValue(true);

    const ranked = await service.findRankedCandidates(baseParams);

    expect(ranked.map((c) => c.userId)).toEqual([freeUser, onJobUser]);
    expect(ranked[0].isOnJob).toBe(false);
    expect(ranked[1].isOnJob).toBe(true);
  });

  it('does not offer ON_JOB beauticians before service progress threshold', async () => {
    mockLocationIndex.searchNearby.mockResolvedValue([]);
    mockPrisma.beauticianProfile.findMany
      .mockResolvedValueOnce([]) // free ONLINE none
      .mockResolvedValueOnce([earlyOnJobProfile]); // ON_JOB load
    mockPrisma.booking.findMany.mockResolvedValue([
      {
        assignedBeauticianUserId: earlyOnJobUser,
        serviceStartedAt: new Date(Date.now() - 10 * 60_000),
        services: [
          {
            serviceId,
            name: 'Braids',
            price: 1,
            quantity: 1,
            duration: 100,
          },
        ],
        status: BookingStatus.IN_PROGRESS,
        updatedAt: new Date(),
      },
    ]);
    mockEligibility.isOnJobNearServiceComplete.mockReturnValue(false);

    const ranked = await service.findRankedCandidates(baseParams);

    expect(ranked).toEqual([]);
    expect(mockEligibility.isOnJobNearServiceComplete).toHaveBeenCalled();
  });

  it('falls back to ON_JOB pool when no free ONLINE candidates exist', async () => {
    mockLocationIndex.searchNearby.mockResolvedValue([]);
    mockPrisma.beauticianProfile.findMany
      .mockResolvedValueOnce([]) // free
      .mockResolvedValueOnce([onJobProfile]);
    mockPrisma.booking.findMany.mockResolvedValue([
      {
        assignedBeauticianUserId: onJobUser,
        serviceStartedAt: new Date(Date.now() - 91 * 60_000),
        services: [
          {
            serviceId,
            name: 'Braids',
            price: 1,
            quantity: 1,
            duration: 100,
          },
        ],
        status: BookingStatus.ARRIVED_VERIFIED,
        updatedAt: new Date(),
      },
    ]);
    mockEligibility.isOnJobNearServiceComplete.mockReturnValue(true);

    const ranked = await service.findRankedCandidates(baseParams);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({
      userId: onJobUser,
      isOnJob: true,
    });
  });

  it('excludes declined/busy beauticians via exclude list', async () => {
    mockLocationIndex.searchNearby.mockResolvedValue([
      { userId: freeUser, distanceKm: 1 },
      { userId: onJobUser, distanceKm: 1.5 },
    ]);
    mockPrisma.beauticianProfile.findMany
      .mockResolvedValueOnce([]) // free load for non-excluded geo ids may be empty
      .mockResolvedValueOnce([]); // on-job also empty after excludes

    const ranked = await service.findRankedCandidates({
      ...baseParams,
      excludeBeauticianUserIds: [freeUser, onJobUser],
    });

    expect(ranked).toEqual([]);
  });

  it('skips profiles missing required service capability', async () => {
    mockLocationIndex.searchNearby.mockResolvedValue([
      { userId: freeUser, distanceKm: 1 },
    ]);
    mockPrisma.beauticianProfile.findMany
      .mockResolvedValueOnce([freeProfile]) // ONLINE pool by status
      .mockResolvedValueOnce([freeProfile]) // free by geo user ids
      .mockResolvedValueOnce([]); // on-job pool
    mockEligibility.coversAllServices.mockReturnValue(false);

    const ranked = await service.findRankedCandidates(baseParams);

    expect(ranked).toEqual([]);
  });
});
