import { Injectable } from '@nestjs/common';
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
  constructor(private readonly matchingConfig: MatchingConfigService) {}

  hasFreshLocation(lastLocationUpdate: Date | null, now = new Date()): boolean {
    if (!lastLocationUpdate) {
      return false;
    }

    const stalenessMinutes = this.matchingConfig.getLocationStalenessMinutes();
    const ageMs = now.getTime() - lastLocationUpdate.getTime();

    return ageMs <= stalenessMinutes * 60 * 1000;
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