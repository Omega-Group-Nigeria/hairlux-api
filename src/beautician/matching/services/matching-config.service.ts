import { Injectable } from '@nestjs/common';
import { DISPATCH_CONFIG_KEYS } from '../constants/dispatch-config.defaults';
import { DispatchConfigResolverService } from './dispatch-config-resolver.service';

@Injectable()
export class MatchingConfigService {
  constructor(private readonly resolver: DispatchConfigResolverService) {}

  getRadiiKm(): number[] {
    const envRadii = this.resolver.getRadiiKmFromEnv();
    if (envRadii) {
      return envRadii;
    }

    return [
      this.resolver.getTierRadiusKm(1),
      this.resolver.getTierRadiusKm(2),
      this.resolver.getTierRadiusKm(3),
    ];
  }

  getMaxAttempts(): number {
    return this.getRadiiKm().length;
  }

  getMaxRadiusKm(): number {
    return Math.max(...this.getRadiiKm());
  }

  resolveRadiusKm(matchingAttempt: number): number {
    return this.resolver.getTierRadiusKm(matchingAttempt);
  }

  getOfferTtlSeconds(matchingAttempt = 1): number {
    return this.resolver.getTierOfferTtlSeconds(matchingAttempt);
  }

  getInterTierDelaySeconds(): number {
    return this.resolver.getInt(
      DISPATCH_CONFIG_KEYS.INTER_TIER_DELAY_SECONDS,
      15,
    );
  }

  getRejectionCooldownSeconds(): number {
    return this.resolver.getInt(
      DISPATCH_CONFIG_KEYS.REJECTION_COOLDOWN_SECONDS,
      120,
    );
  }

  getLocationStalenessMinutes(): number {
    return this.resolver.getInt(
      DISPATCH_CONFIG_KEYS.LOCATION_STALENESS_MINUTES,
      5,
    );
  }

  getLocationRematchMinDistanceM(): number {
    return this.resolver.getInt(
      DISPATCH_CONFIG_KEYS.LOCATION_REMATCH_MIN_DISTANCE_M,
      500,
    );
  }

  isWakeExhaustedOnOnlineEnabled(): boolean {
    return (
      this.resolver.getInt(
        DISPATCH_CONFIG_KEYS.WAKE_EXHAUSTED_ON_ONLINE_ENABLED,
        0,
      ) === 1
    );
  }

  getScoringWeights() {
    return {
      distance: this.resolver.getFloat(
        DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_DISTANCE,
        1,
      ),
      rating: this.resolver.getFloat(
        DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_RATING,
        0.3,
      ),
      acceptanceRate: this.resolver.getFloat(
        DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_ACCEPTANCE_RATE,
        0.2,
      ),
      idleMinutes: this.resolver.getFloat(
        DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_IDLE_MINUTES,
        0.1,
      ),
    };
  }
}