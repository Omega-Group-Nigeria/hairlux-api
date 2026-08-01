import { Injectable } from '@nestjs/common';
import { MatchingConfigService } from './matching-config.service';
import { BeauticianOfferMetrics } from './candidate-metrics.service';

export interface CandidateScoreResult {
  score: number;
  snapshot: {
    distanceKm: number;
    tier: number;
    score: number;
    components: {
      distance: number;
      rating: number;
      acceptanceRate: number;
      idleMinutes: number;
    };
    weights: {
      distance: number;
      rating: number;
      acceptanceRate: number;
      idleMinutes: number;
    };
  };
}

@Injectable()
export class CandidateScorerService {
  constructor(private readonly matchingConfig: MatchingConfigService) {}

  score(
    distanceKm: number,
    ratingAverage: number,
    metrics: BeauticianOfferMetrics,
    tier: number,
  ): CandidateScoreResult {
    const weights = this.matchingConfig.getScoringWeights();

    const distanceComponent = weights.distance * (1 / Math.max(distanceKm, 0.1));
    const ratingComponent = weights.rating * Math.min(ratingAverage / 5, 1);
    const acceptanceComponent = weights.acceptanceRate * metrics.acceptanceRate;
    const idleComponent =
      weights.idleMinutes * Math.min(metrics.idleMinutes / 120, 1);

    const score =
      distanceComponent + ratingComponent + acceptanceComponent + idleComponent;

    return {
      score,
      snapshot: {
        distanceKm,
        tier,
        score,
        components: {
          distance: distanceComponent,
          rating: ratingComponent,
          acceptanceRate: acceptanceComponent,
          idleMinutes: idleComponent,
        },
        weights,
      },
    };
  }
}