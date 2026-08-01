import { Injectable } from '@nestjs/common';
import { MatchingExhaustedReason } from '@prisma/client';
import { CandidatePoolStats } from './candidate-pool-analyzer.service';

@Injectable()
export class MatchingExhaustionResolverService {
  resolve(params: {
    stats: CandidatePoolStats;
    hadOffersInBooking: boolean;
  }): MatchingExhaustedReason {
    if (params.stats.onlineEligibleCount === 0) {
      return MatchingExhaustedReason.NO_BEAUTICIANS_ONLINE;
    }

    if (params.hadOffersInBooking) {
      return MatchingExhaustedReason.OFFERS_NOT_ACCEPTED;
    }

    if (params.stats.inMaxRadiusCount === 0) {
      return MatchingExhaustedReason.COVERAGE_GAP;
    }

    return MatchingExhaustedReason.NO_CANDIDATES_IN_AREA;
  }
}