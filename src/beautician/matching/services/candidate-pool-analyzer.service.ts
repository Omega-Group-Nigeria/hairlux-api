import { Injectable } from '@nestjs/common';
import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { haversineKm } from '../utils/geo.util';
import { CandidateEligibilityService } from './candidate-eligibility.service';
import { BeauticianLocationIndexService } from './beautician-location-index.service';

export interface CandidatePoolStats {
  onlineEligibleCount: number;
  freshLocationCount: number;
  inTierRadiusCount: number;
  inMaxRadiusCount: number;
}

@Injectable()
export class CandidatePoolAnalyzerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CandidateEligibilityService,
    private readonly locationIndex: BeauticianLocationIndexService,
  ) {}

  async analyze(params: {
    customerLat: number;
    customerLng: number;
    tierRadiusKm: number;
    maxRadiusKm: number;
    requiredServiceIds: string[];
    excludeBeauticianUserIds: string[];
  }): Promise<CandidatePoolStats> {
    const geoHits = await this.locationIndex.searchNearby(
      params.customerLng,
      params.customerLat,
      params.maxRadiusKm,
      100,
    );

    const excludeSet = new Set(params.excludeBeauticianUserIds);
    const geoUserIds = geoHits
      .map((hit) => hit.userId)
      .filter((userId) => !excludeSet.has(userId));

    const profiles =
      geoUserIds.length > 0
        ? await this.prisma.beauticianProfile.findMany({
            where: {
              userId: { in: geoUserIds },
              isActive: true,
              dispatchSuspended: false,
              kycStatus: KycStatus.VERIFIED,
              profileStatus: ProfileReviewStatus.APPROVED,
              availabilityStatus: AvailabilityStatus.ONLINE,
            },
            include: {
              assignedServices: { select: { serviceId: true } },
            },
          })
        : await this.prisma.beauticianProfile.findMany({
            where: {
              isActive: true,
              dispatchSuspended: false,
              kycStatus: KycStatus.VERIFIED,
              profileStatus: ProfileReviewStatus.APPROVED,
              availabilityStatus: AvailabilityStatus.ONLINE,
              userId: { notIn: params.excludeBeauticianUserIds },
            },
            include: {
              assignedServices: { select: { serviceId: true } },
            },
          });

    const distanceByUserId = new Map(
      geoHits.map((hit) => [hit.userId, hit.distanceKm]),
    );

    const stats: CandidatePoolStats = {
      onlineEligibleCount: 0,
      freshLocationCount: 0,
      inTierRadiusCount: 0,
      inMaxRadiusCount: 0,
    };

    const now = new Date();

    for (const profile of profiles) {
      const assignedServiceIds = profile.assignedServices.map(
        (item) => item.serviceId,
      );

      if (
        !this.eligibility.coversAllServices(
          assignedServiceIds,
          params.requiredServiceIds,
        )
      ) {
        continue;
      }

      stats.onlineEligibleCount += 1;

      if (!this.eligibility.hasFreshLocation(profile.lastLocationUpdate, now)) {
        continue;
      }

      const lat = profile.currentLat ? Number(profile.currentLat) : null;
      const lng = profile.currentLng ? Number(profile.currentLng) : null;
      if (lat == null || lng == null) {
        continue;
      }

      stats.freshLocationCount += 1;

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
        !this.eligibility.isWithinBeauticianTravelLimit(
          distanceKm,
          maxTravelRadiusKm,
        )
      ) {
        continue;
      }

      if (distanceKm <= params.tierRadiusKm) {
        stats.inTierRadiusCount += 1;
      }

      if (distanceKm <= params.maxRadiusKm) {
        stats.inMaxRadiusCount += 1;
      }
    }

    return stats;
  }
}