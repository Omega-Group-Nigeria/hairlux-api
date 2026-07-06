import { Injectable, Logger } from '@nestjs/common';
import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { haversineKm } from '../utils/geo.util';
import { CandidateEligibilityService } from './candidate-eligibility.service';
import { CandidateMetricsService } from './candidate-metrics.service';
import { CandidateScorerService } from './candidate-scorer.service';
import { BeauticianLocationIndexService } from './beautician-location-index.service';

export interface MatchingCandidate {
  userId: string;
  profileId: string;
  distanceKm: number;
  commissionRateOverride: number | null;
  score: number;
  scoreSnapshot: Record<string, unknown>;
}

@Injectable()
export class CandidateFinderService {
  private readonly logger = new Logger(CandidateFinderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CandidateEligibilityService,
    private readonly metricsService: CandidateMetricsService,
    private readonly scorer: CandidateScorerService,
    private readonly locationIndex: BeauticianLocationIndexService,
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
    const geoHits = await this.locationIndex.searchNearby(
      params.customerLng,
      params.customerLat,
      params.radiusKm,
      50,
    );

    const excludeSet = new Set(params.excludeBeauticianUserIds);
    const geoUserIds = geoHits
      .map((hit) => hit.userId)
      .filter((userId) => !excludeSet.has(userId));

    const profiles =
      geoUserIds.length > 0
        ? await this.loadProfilesByUserIds(geoUserIds)
        : await this.loadAllOnlineProfiles(params.excludeBeauticianUserIds);

    const distanceByUserId = new Map(
      geoHits.map((hit) => [hit.userId, hit.distanceKm]),
    );

    const now = new Date();
    const tier = params.matchingAttempt ?? 1;
    const eligibleProfiles = profiles.filter((profile) => {
      const assignedServiceIds = profile.assignedServices.map(
        (item) => item.serviceId,
      );

      return (
        this.eligibility.coversAllServices(
          assignedServiceIds,
          params.requiredServiceIds,
        ) && this.eligibility.hasFreshLocation(profile.lastLocationUpdate, now)
      );
    });

    const userIds = eligibleProfiles.map((profile) => profile.userId);
    const metricsByUser = await this.metricsService.loadMetrics(userIds);

    const ranked = eligibleProfiles
      .map((profile) => {
        const lat = profile.currentLat ? Number(profile.currentLat) : null;
        const lng = profile.currentLng ? Number(profile.currentLng) : null;

        if (lat == null || lng == null) {
          return null;
        }

        const distanceKm =
          distanceByUserId.get(profile.userId) ??
          haversineKm(
            lat,
            lng,
            params.customerLat,
            params.customerLng,
          );

        const maxTravelRadiusKm = profile.maxTravelRadiusKm
          ? Number(profile.maxTravelRadiusKm)
          : null;

        if (
          !this.eligibility.isWithinTierRadius(distanceKm, params.radiusKm) ||
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
          tier,
        );

        return {
          userId: profile.userId,
          profileId: profile.id,
          distanceKm,
          commissionRateOverride: profile.commissionRateOverride
            ? Number(profile.commissionRateOverride)
            : null,
          score: scored.score,
          scoreSnapshot: scored.snapshot,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.score - a.score);

    if (!ranked.length) {
      this.logger.warn(
        `No matching beauticians found for booking ${params.bookingId}` +
          (params.matchingAttempt
            ? ` on attempt ${params.matchingAttempt} (${params.radiusKm}km)`
            : ` within ${params.radiusKm}km`),
      );
    }

    return ranked;
  }

  async getNextCandidate(
    params: Parameters<CandidateFinderService['findRankedCandidates']>[0],
  ): Promise<MatchingCandidate | null> {
    const ranked = await this.findRankedCandidates(params);
    return ranked[0] ?? null;
  }

  private async loadProfilesByUserIds(userIds: string[]) {
    return this.prisma.beauticianProfile.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
        dispatchSuspended: false,
        kycStatus: KycStatus.VERIFIED,
        profileStatus: ProfileReviewStatus.APPROVED,
        availabilityStatus: AvailabilityStatus.ONLINE,
      },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });
  }

  private async loadAllOnlineProfiles(excludeBeauticianUserIds: string[]) {
    return this.prisma.beauticianProfile.findMany({
      where: {
        isActive: true,
        dispatchSuspended: false,
        kycStatus: KycStatus.VERIFIED,
        profileStatus: ProfileReviewStatus.APPROVED,
        availabilityStatus: AvailabilityStatus.ONLINE,
        userId: { notIn: excludeBeauticianUserIds },
      },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });
  }
}