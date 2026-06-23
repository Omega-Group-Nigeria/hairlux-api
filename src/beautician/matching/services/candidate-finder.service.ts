import { Injectable, Logger } from '@nestjs/common';
import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { haversineKm } from '../utils/geo.util';

export interface MatchingCandidate {
  userId: string;
  profileId: string;
  distanceKm: number;
  commissionRateOverride: number | null;
}

@Injectable()
export class CandidateFinderService {
  private readonly logger = new Logger(CandidateFinderService.name);
  private readonly batchSize = 5;

  constructor(private readonly prisma: PrismaService) {}

  async findCandidates(params: {
    bookingId: string;
    customerLat: number;
    customerLng: number;
    radiusKm: number;
    requiredServiceIds: string[];
    excludeBeauticianUserIds: string[];
  }): Promise<MatchingCandidate[]> {
    const profiles = await this.prisma.beauticianProfile.findMany({
      where: {
        isActive: true,
        kycStatus: KycStatus.VERIFIED,
        profileStatus: ProfileReviewStatus.APPROVED,
        availabilityStatus: AvailabilityStatus.ONLINE,
        userId: { notIn: params.excludeBeauticianUserIds },
      },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });

    const eligible = profiles.filter((profile) =>
      this.coversAllServices(
        profile.assignedServices.map((item) => item.serviceId),
        params.requiredServiceIds,
      ),
    );

    const withDistance = eligible
      .map((profile) => {
        const lat = profile.currentLat
          ? Number(profile.currentLat)
          : profile.baseLat
            ? Number(profile.baseLat)
            : null;
        const lng = profile.currentLng
          ? Number(profile.currentLng)
          : profile.baseLng
            ? Number(profile.baseLng)
            : null;

        if (lat == null || lng == null) {
          return null;
        }

        const distanceKm = haversineKm(
          lat,
          lng,
          params.customerLat,
          params.customerLng,
        );

        if (distanceKm > params.radiusKm) {
          return null;
        }

        return {
          userId: profile.userId,
          profileId: profile.id,
          distanceKm,
          commissionRateOverride: profile.commissionRateOverride
            ? Number(profile.commissionRateOverride)
            : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, this.batchSize);

    if (!withDistance.length) {
      this.logger.warn(
        `No matching beauticians found for booking ${params.bookingId}`,
      );
    }

    return withDistance.map((item) => ({
      userId: item.userId,
      profileId: item.profileId,
      distanceKm: item.distanceKm,
      commissionRateOverride: item.commissionRateOverride,
    }));
  }

  private coversAllServices(
    assignedServiceIds: string[],
    requiredServiceIds: string[],
  ): boolean {
    const assigned = new Set(assignedServiceIds);
    return requiredServiceIds.every((serviceId) => assigned.has(serviceId));
  }
}