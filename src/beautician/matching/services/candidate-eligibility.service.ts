import { Injectable } from '@nestjs/common';
import { HomeServiceStatusService } from '../../home-service-booking/home-service-status.service';
import { MatchingConfigService } from './matching-config.service';

export interface EligibleBeauticianProfile {
  userId: string;
  profileId: string;
  currentLat: number;
  currentLng: number;
  lastLocationUpdate: Date | null;
  maxTravelRadiusKm: number | null;
  ratingAverage: number;
  assignedServiceIds: string[];
}

@Injectable()
export class CandidateEligibilityService {
  constructor(
    private readonly matchingConfig: MatchingConfigService,
    private readonly homeServiceStatus: HomeServiceStatusService,
  ) {}

  hasFreshLocation(lastLocationUpdate: Date | null, now = new Date()): boolean {
    if (!lastLocationUpdate) {
      return false;
    }

    const stalenessMinutes = this.matchingConfig.getLocationStalenessMinutes();
    const ageMs = now.getTime() - lastLocationUpdate.getTime();

    return ageMs <= stalenessMinutes * 60 * 1000;
  }

  /**
   * ON_JOB beauticians become offer-eligible after enough of their current
   * service duration has elapsed (config/env percent, default 90).
   */
  isOnJobNearServiceComplete(
    serviceStartedAt: Date | null | undefined,
    services: unknown,
    now = new Date(),
  ): boolean {
    const percent = this.matchingConfig.getOnJobOfferEligiblePercent();
    return this.homeServiceStatus.hasReachedServiceProgressPercent(
      serviceStartedAt,
      services,
      percent,
      now,
    );
  }

  coversAllServices(
    assignedServiceIds: string[],
    requiredServiceIds: string[],
  ): boolean {
    const assigned = new Set(assignedServiceIds);
    return requiredServiceIds.every((serviceId) => assigned.has(serviceId));
  }

  isWithinTierRadius(distanceKm: number, radiusKm: number): boolean {
    return distanceKm <= radiusKm;
  }

  isWithinBeauticianTravelLimit(
    distanceKm: number,
    maxTravelRadiusKm: number | null,
  ): boolean {
    if (maxTravelRadiusKm == null) {
      return true;
    }

    return distanceKm <= maxTravelRadiusKm;
  }
}
