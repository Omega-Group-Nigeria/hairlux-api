import { Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  DispatchStatus,
  MatchingExhaustedReason,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { MatchingConfigService } from './matching-config.service';
import { CandidatePoolAnalyzerService } from './candidate-pool-analyzer.service';
import { MatchingExhaustionResolverService } from './matching-exhaustion-resolver.service';
import { OfferExclusionService } from './offer-exclusion.service';
import { DispatchStateService } from './dispatch-state.service';
import { DISPATCH_EVENT_TYPES } from '../constants/dispatch-event.constants';
import { MatchingQueueService } from './matching-queue.service';
import {
  MAX_SAME_TIER_ONLINE_RETRIES,
  matchingJobIds,
  matchingRedisKeys,
} from '../constants/matching-queue.constants';

export type MatchingSearchContext = {
  customerLat: number;
  customerLng: number;
  requiredServiceIds: string[];
  excludeIds: string[];
  tierRadiusKm: number;
};

/**
 * Handles no-candidate outcomes: same-tier wait, tier escalate, exhaustion.
 * Keeps circuit-breaker logic for same-tier online retries out of the orchestrator.
 */
@Injectable()
export class MatchingAttemptService {
  private readonly logger = new Logger(MatchingAttemptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly matchingConfig: MatchingConfigService,
    private readonly poolAnalyzer: CandidatePoolAnalyzerService,
    private readonly exhaustionResolver: MatchingExhaustionResolverService,
    private readonly offerExclusion: OfferExclusionService,
    private readonly dispatchState: DispatchStateService,
    private readonly matchingQueue: MatchingQueueService,
  ) {}

  async handleNoCandidate(
    bookingId: string,
    attempt: number,
    searchContext: MatchingSearchContext,
  ): Promise<void> {
    const declinedIds =
      await this.offerExclusion.getDeclinedBeauticianIds(bookingId);
    const maxRadiusKm = this.matchingConfig.getMaxRadiusKm();

    const statsAll = await this.poolAnalyzer.analyze({
      customerLat: searchContext.customerLat,
      customerLng: searchContext.customerLng,
      tierRadiusKm: searchContext.tierRadiusKm,
      maxRadiusKm,
      requiredServiceIds: searchContext.requiredServiceIds,
      excludeBeauticianUserIds: [],
    });

    const statsEligible = await this.poolAnalyzer.analyze({
      customerLat: searchContext.customerLat,
      customerLng: searchContext.customerLng,
      tierRadiusKm: searchContext.tierRadiusKm,
      maxRadiusKm,
      requiredServiceIds: searchContext.requiredServiceIds,
      excludeBeauticianUserIds: declinedIds,
    });

    if (
      statsEligible.inTierRadiusCount === 0 &&
      declinedIds.length > 0 &&
      statsAll.inTierRadiusCount > 0
    ) {
      await this.markMatchingExhausted(
        bookingId,
        MatchingExhaustedReason.OFFERS_NOT_ACCEPTED,
      );
      return;
    }

    if (statsAll.onlineEligibleCount === 0) {
      await this.scheduleSameTierRetry(bookingId, attempt);
      return;
    }

    const maxAttempts = this.matchingConfig.getMaxAttempts();
    if (statsEligible.inTierRadiusCount === 0 && attempt < maxAttempts) {
      await this.scheduleNextMatchingAttempt(bookingId, attempt, searchContext);
      return;
    }

    if (statsEligible.inTierRadiusCount === 0) {
      await this.markMatchingExhaustedFromContext(bookingId, {
        ...searchContext,
        excludeIds: declinedIds,
      });
      return;
    }

    await this.scheduleSameTierRetry(bookingId, attempt);
  }

  async markMatchingExhausted(
    bookingId: string,
    reason: MatchingExhaustedReason,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        matchingExhaustedAt: true,
        dispatchStatus: true,
      },
    });

    if (
      !booking ||
      booking.status !== BookingStatus.PENDING_ASSIGNMENT ||
      booking.matchingExhaustedAt
    ) {
      return;
    }

    const result = await this.dispatchState.transition(bookingId, {
      from: booking.dispatchStatus ?? undefined,
      to: DispatchStatus.MATCH_EXHAUSTED,
      eventType: DISPATCH_EVENT_TYPES.MATCH_EXHAUSTED,
      matchingExhaustedAt: new Date(),
      matchingExhaustedReason: reason,
      payload: { reason },
      idempotencyKey: `exhausted:${bookingId}:${reason}`,
    });

    if (result.applied) {
      this.logger.warn(
        `Matching exhausted for booking ${bookingId} — ${reason}`,
      );
    }
  }

  private async scheduleSameTierRetry(
    bookingId: string,
    attempt: number,
  ): Promise<void> {
    const retryCount = await this.incrementSameTierRetries(bookingId, attempt);
    if (retryCount > MAX_SAME_TIER_ONLINE_RETRIES) {
      this.logger.warn(
        `Same-tier online retry cap (${MAX_SAME_TIER_ONLINE_RETRIES}) reached for booking ${bookingId} tier ${attempt}`,
      );
      await this.markMatchingExhausted(
        bookingId,
        MatchingExhaustedReason.NO_CANDIDATES_IN_AREA,
      );
      return;
    }

    const delaySeconds = this.matchingConfig.getInterTierDelaySeconds();
    const delayMs = delaySeconds * 1000;
    const jobId = matchingJobIds.waitOnline(bookingId, attempt);

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.CANDIDATES_SEARCHED,
      {
        tier: attempt,
        phase: 'wait_for_online_candidates',
        delaySeconds,
        sameTierRetry: retryCount,
      },
      `wait-online:${bookingId}:${attempt}:${retryCount}`,
    );

    await this.matchingQueue.scheduleCreateOffers(
      { bookingId, matchingAttempt: attempt },
      { delayMs, jobId },
    );

    this.logger.log(
      `Scheduled same-tier retry ${retryCount}/${MAX_SAME_TIER_ONLINE_RETRIES} for booking ${bookingId} (tier ${attempt}) in ${delaySeconds}s`,
    );
  }

  private async scheduleNextMatchingAttempt(
    bookingId: string,
    currentAttempt: number,
    searchContext: MatchingSearchContext,
  ): Promise<void> {
    const nextAttempt = currentAttempt + 1;
    const maxAttempts = this.matchingConfig.getMaxAttempts();

    if (nextAttempt > maxAttempts) {
      await this.markMatchingExhaustedFromContext(bookingId, searchContext);
      return;
    }

    const delaySeconds = this.matchingConfig.getInterTierDelaySeconds();
    const delayMs = delaySeconds * 1000;
    const jobId = matchingJobIds.nextTier(bookingId, nextAttempt);

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.TIER_ESCALATED,
      {
        fromTier: currentAttempt,
        toTier: nextAttempt,
        delaySeconds,
      },
      `tier:${bookingId}:${nextAttempt}`,
    );

    await this.matchingQueue.scheduleCreateOffers(
      { bookingId, matchingAttempt: nextAttempt },
      { delayMs, jobId },
    );

    this.logger.log(
      `Scheduled matching attempt ${nextAttempt} for booking ${bookingId} in ${delaySeconds}s`,
    );
  }

  private async markMatchingExhaustedFromContext(
    bookingId: string,
    searchContext: MatchingSearchContext,
  ): Promise<void> {
    const stats = await this.poolAnalyzer.analyze({
      customerLat: searchContext.customerLat,
      customerLng: searchContext.customerLng,
      tierRadiusKm: searchContext.tierRadiusKm,
      maxRadiusKm: this.matchingConfig.getMaxRadiusKm(),
      requiredServiceIds: searchContext.requiredServiceIds,
      excludeBeauticianUserIds: searchContext.excludeIds,
    });

    const offerCount = await this.prisma.jobOffer.count({
      where: { bookingId },
    });

    const reason = this.exhaustionResolver.resolve({
      stats,
      hadOffersInBooking: offerCount > 0,
    });

    await this.markMatchingExhausted(bookingId, reason);
  }

  private async incrementSameTierRetries(
    bookingId: string,
    attempt: number,
  ): Promise<number> {
    const key = matchingRedisKeys.sameTierRetries(bookingId, attempt);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 6 * 60 * 60);
    }
    return count;
  }
}
