import { Injectable, Logger } from '@nestjs/common';
import {
  AvailabilityStatus,
  BookingStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { haversineKm } from '../utils/geo.util';
import { CandidateEligibilityService } from './candidate-eligibility.service';
import { CandidateMetricsService } from './candidate-metrics.service';
import { CandidateScorerService } from './candidate-scorer.service';
import { BeauticianLocationIndexService } from './beautician-location-index.service';
import { MatchingConfigService } from './matching-config.service';
import {
  pickNextCandidateInRotation,
  pickTopCandidatesInRotation,
} from '../utils/offer-rotation.util';

export interface MatchingCandidate {
  userId: string;
  profileId: string;
  distanceKm: number;
  score: number;
  scoreSnapshot: Record<string, unknown>;
  /** Free ONLINE candidates rank above near-complete ON_JOB. */
  isOnJob: boolean;
}

/** Bookings where service time is underway (serviceStartedAt set on arrival verify). */
const ON_JOB_ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.ARRIVED_VERIFIED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.AWAITING_CUSTOMER_CONFIRM,
];

@Injectable()
export class CandidateFinderService {
  private readonly logger = new Logger(CandidateFinderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CandidateEligibilityService,
    private readonly metricsService: CandidateMetricsService,
    private readonly scorer: CandidateScorerService,
    private readonly locationIndex: BeauticianLocationIndexService,
    private readonly matchingConfig: MatchingConfigService,
  ) {}

  async findRankedCandidates(params: {
    bookingId: string;
    matchingAttempt?: number;
    customerLat: number;
    customerLng: number;
    radiusKm: number;
    requiredServiceIds: string[];
    excludeBeauticianUserIds: string[];
  }): Promise<MatchingCandidate[]> {
    const excludeSet = new Set(params.excludeBeauticianUserIds);
    const now = new Date();
    const tier = params.matchingAttempt ?? 1;

    const freeCandidates = await this.findFreeOnlineCandidates(params, excludeSet, now, tier);
    const freeUserIds = new Set(freeCandidates.map((c) => c.userId));

    const onJobCandidates = await this.findNearCompleteOnJobCandidates(
      params,
      excludeSet,
      freeUserIds,
      now,
      tier,
    );

    // Free (ONLINE) always before ON_JOB; within each group, higher score first
    const ranked = [...freeCandidates, ...onJobCandidates];

    if (!ranked.length) {
      this.logger.warn(
        `No matching beauticians found for booking ${params.bookingId}` +
          (params.matchingAttempt
            ? ` on attempt ${params.matchingAttempt} (${params.radiusKm}km)`
            : ` within ${params.radiusKm}km`),
      );
    } else if (onJobCandidates.length) {
      this.logger.debug(
        `Booking ${params.bookingId}: ${freeCandidates.length} free + ${onJobCandidates.length} near-complete ON_JOB candidates`,
      );
    }

    return ranked;
  }

  async getNextCandidate(
    params: Parameters<CandidateFinderService['findRankedCandidates']>[0] & {
      rotateAfterBeauticianUserId?: string | null;
    },
  ): Promise<MatchingCandidate | null> {
    const { rotateAfterBeauticianUserId, ...rankedParams } = params;
    const ranked = await this.findRankedCandidates(rankedParams);
    return pickNextCandidateInRotation(ranked, rotateAfterBeauticianUserId);
  }

  /** Top N candidates for concurrent offers (same ranking / free-first priority). */
  async getTopCandidates(
    params: Parameters<CandidateFinderService['findRankedCandidates']>[0] & {
      rotateAfterBeauticianUserId?: string | null;
      limit: number;
    },
  ): Promise<MatchingCandidate[]> {
    const { rotateAfterBeauticianUserId, limit, ...rankedParams } = params;
    const ranked = await this.findRankedCandidates(rankedParams);
    return pickTopCandidatesInRotation(
      ranked,
      rotateAfterBeauticianUserId,
      limit,
    );
  }

  private async findFreeOnlineCandidates(
    params: {
      customerLat: number;
      customerLng: number;
      radiusKm: number;
      requiredServiceIds: string[];
    },
    excludeSet: Set<string>,
    now: Date,
    tier: number,
  ): Promise<MatchingCandidate[]> {
    const geoHits = await this.locationIndex.searchNearby(
      params.customerLng,
      params.customerLat,
      params.radiusKm,
      50,
    );

    const geoUserIds = geoHits
      .map((hit) => hit.userId)
      .filter((userId) => !excludeSet.has(userId));

    const profiles =
      geoUserIds.length > 0
        ? await this.loadProfilesByUserIds(geoUserIds, [
            AvailabilityStatus.ONLINE,
          ])
        : await this.loadProfilesByStatus(
            [AvailabilityStatus.ONLINE],
            [...excludeSet],
          );

    const distanceByUserId = new Map(
      geoHits.map((hit) => [hit.userId, hit.distanceKm]),
    );

    return this.rankProfiles({
      profiles,
      distanceByUserId,
      params,
      now,
      tier,
      isOnJob: false,
    });
  }

  private async findNearCompleteOnJobCandidates(
    params: {
      customerLat: number;
      customerLng: number;
      radiusKm: number;
      requiredServiceIds: string[];
    },
    excludeSet: Set<string>,
    freeUserIds: Set<string>,
    now: Date,
    tier: number,
  ): Promise<MatchingCandidate[]> {
    const profiles = await this.loadProfilesByStatus(
      [AvailabilityStatus.ON_JOB],
      [...excludeSet, ...freeUserIds],
    );

    if (!profiles.length) {
      return [];
    }

    const userIds = profiles.map((p) => p.userId);
    const activeJobs = await this.prisma.booking.findMany({
      where: {
        assignedBeauticianUserId: { in: userIds },
        status: { in: ON_JOB_ACTIVE_STATUSES },
        serviceStartedAt: { not: null },
      },
      select: {
        assignedBeauticianUserId: true,
        serviceStartedAt: true,
        services: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const jobByBeautician = new Map<
      string,
      { serviceStartedAt: Date; services: unknown }
    >();

    for (const job of activeJobs) {
      const uid = job.assignedBeauticianUserId;
      if (!uid || jobByBeautician.has(uid) || !job.serviceStartedAt) {
        continue;
      }
      jobByBeautician.set(uid, {
        serviceStartedAt: job.serviceStartedAt,
        services: job.services,
      });
    }

    const eligibleOnJob = profiles.filter((profile) => {
      const job = jobByBeautician.get(profile.userId);
      if (!job) {
        return false;
      }
      return this.eligibility.isOnJobNearServiceComplete(
        job.serviceStartedAt,
        job.services,
        now,
      );
    });

    if (!eligibleOnJob.length) {
      return [];
    }

    const percent = this.matchingConfig.getOnJobOfferEligiblePercent();

    return this.rankProfiles({
      profiles: eligibleOnJob,
      distanceByUserId: new Map(),
      params,
      now,
      tier,
      isOnJob: true,
      scoreSnapshotExtra: {
        isOnJob: true,
        onJobEligiblePercent: percent,
      },
    });
  }

  private async rankProfiles(args: {
    profiles: Array<{
      id: string;
      userId: string;
      currentLat: unknown;
      currentLng: unknown;
      lastLocationUpdate: Date | null;
      maxTravelRadiusKm: unknown;
      ratingAverage: unknown;
      assignedServices: Array<{ serviceId: string }>;
    }>;
    distanceByUserId: Map<string, number>;
    params: {
      customerLat: number;
      customerLng: number;
      radiusKm: number;
      requiredServiceIds: string[];
    };
    now: Date;
    tier: number;
    isOnJob: boolean;
    scoreSnapshotExtra?: Record<string, unknown>;
  }): Promise<MatchingCandidate[]> {
    const eligibleProfiles = args.profiles.filter((profile) => {
      const assignedServiceIds = profile.assignedServices.map(
        (item) => item.serviceId,
      );

      return (
        this.eligibility.coversAllServices(
          assignedServiceIds,
          args.params.requiredServiceIds,
        ) &&
        this.eligibility.hasFreshLocation(profile.lastLocationUpdate, args.now)
      );
    });

    const userIds = eligibleProfiles.map((profile) => profile.userId);
    const metricsByUser = await this.metricsService.loadMetrics(userIds);

    return eligibleProfiles
      .map((profile) => {
        const lat = profile.currentLat ? Number(profile.currentLat) : null;
        const lng = profile.currentLng ? Number(profile.currentLng) : null;

        if (lat == null || lng == null) {
          return null;
        }

        const distanceKm =
          args.distanceByUserId.get(profile.userId) ??
          haversineKm(
            lat,
            lng,
            args.params.customerLat,
            args.params.customerLng,
          );

        const maxTravelRadiusKm = profile.maxTravelRadiusKm
          ? Number(profile.maxTravelRadiusKm)
          : null;

        if (
          !this.eligibility.isWithinTierRadius(
            distanceKm,
            args.params.radiusKm,
          ) ||
          !this.eligibility.isWithinBeauticianTravelLimit(
            distanceKm,
            maxTravelRadiusKm,
          )
        ) {
          return null;
        }

        const metrics = metricsByUser.get(profile.userId) ?? {
          acceptanceRate: 0.5,
          idleMinutes: 24 * 60,
        };

        const scored = this.scorer.score(
          distanceKm,
          Number(profile.ratingAverage),
          metrics,
          args.tier,
        );

        return {
          userId: profile.userId,
          profileId: profile.id,
          distanceKm,
          score: scored.score,
          isOnJob: args.isOnJob,
          scoreSnapshot: {
            ...scored.snapshot,
            isOnJob: args.isOnJob,
            ...args.scoreSnapshotExtra,
          },
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.score - a.score);
  }

  private async loadProfilesByUserIds(
    userIds: string[],
    statuses: AvailabilityStatus[],
  ) {
    return this.prisma.beauticianProfile.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
        dispatchSuspended: false,
        kycStatus: KycStatus.VERIFIED,
        profileStatus: ProfileReviewStatus.APPROVED,
        availabilityStatus: { in: statuses },
      },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });
  }

  private async loadProfilesByStatus(
    statuses: AvailabilityStatus[],
    excludeBeauticianUserIds: string[],
  ) {
    return this.prisma.beauticianProfile.findMany({
      where: {
        isActive: true,
        dispatchSuspended: false,
        kycStatus: KycStatus.VERIFIED,
        profileStatus: ProfileReviewStatus.APPROVED,
        availabilityStatus: { in: statuses },
        currentLat: { not: null },
        currentLng: { not: null },
        ...(excludeBeauticianUserIds.length
          ? { userId: { notIn: excludeBeauticianUserIds } }
          : {}),
      },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });
  }
}
