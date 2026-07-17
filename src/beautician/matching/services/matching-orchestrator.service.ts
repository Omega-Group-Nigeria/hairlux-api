import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  BookingStatus,
  DispatchStatus,
  JobOfferStatus,
  MatchingExhaustedReason,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { GeocodingService } from '../../../common/services/geocoding.service';
import { normalizeBookingServices } from '../../../booking/utils/booking.utils';
import { HOME_SERVICE_MATCHING_QUEUE } from '../../home-service-booking/home-service-booking.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import {
  extractHomeServiceIds,
  sumHomeServiceAmount,
} from '../utils/booking-assignment.utils';
import { MatchingConfigService } from './matching-config.service';
import { CandidateFinderService } from './candidate-finder.service';
import { CandidatePoolAnalyzerService } from './candidate-pool-analyzer.service';
import { MatchingExhaustionResolverService } from './matching-exhaustion-resolver.service';
import { OfferExclusionService } from './offer-exclusion.service';
import { OfferManagerService } from './offer-manager.service';
import { DispatchStateService } from './dispatch-state.service';
import { DISPATCH_EVENT_TYPES } from '../constants/dispatch-event.constants';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';
import { RedisService } from '../../../redis/redis.service';
import { bookingExhaustedWakeRetryKey } from '../constants/location-index.constants';

@Injectable()
export class MatchingOrchestratorService {
  private readonly logger = new Logger(MatchingOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly matchingConfig: MatchingConfigService,
    private readonly candidateFinder: CandidateFinderService,
    private readonly poolAnalyzer: CandidatePoolAnalyzerService,
    private readonly exhaustionResolver: MatchingExhaustionResolverService,
    private readonly offerExclusion: OfferExclusionService,
    private readonly offerManager: OfferManagerService,
    private readonly dispatchState: DispatchStateService,
    private readonly realtimePublisher: RealtimePublisherService,
    private readonly redis: RedisService,
    @InjectQueue(HOME_SERVICE_MATCHING_QUEUE)
    private readonly matchingQueue: Queue,
  ) {}

  async createOffersForBooking(
    bookingId: string,
    matchingAttempt = 1,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        matchingExhaustedAt: true,
        matchingStartedAt: true,
      },
    });

    if (!booking) {
      this.logger.warn(`Booking ${bookingId} not found for matching`);
      return;
    }

    if (booking.status !== BookingStatus.PENDING_ASSIGNMENT) {
      this.logger.log(
        `Skipping matching for booking ${bookingId} — status ${booking.status}`,
      );
      return;
    }

    if (booking.matchingExhaustedAt) {
      this.logger.log(
        `Skipping matching for booking ${bookingId} — attempts already exhausted`,
      );
      return;
    }

    if (!booking.matchingStartedAt) {
      await this.dispatchState.transition(bookingId, {
        to: DispatchStatus.PENDING_MATCH,
        eventType: DISPATCH_EVENT_TYPES.MATCHING_STARTED,
        matchingStartedAt: new Date(),
        idempotencyKey: `start:${bookingId}`,
      });
    }

    await this.continueMatching(bookingId, matchingAttempt);
  }

  async continueMatching(bookingId: string, matchingAttempt?: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { address: true },
    });

    if (!booking) {
      return;
    }

    if (
      booking.status !== BookingStatus.PENDING_ASSIGNMENT ||
      booking.matchingExhaustedAt
    ) {
      return;
    }

    const attempt = matchingAttempt ?? booking.matchingAttempt;
    const maxAttempts = this.matchingConfig.getMaxAttempts();

    if (attempt > maxAttempts) {
      await this.markMatchingExhausted(
        bookingId,
        MatchingExhaustedReason.NO_CANDIDATES_IN_AREA,
      );
      return;
    }

    if (await this.hasActiveOffers(bookingId)) {
      this.logger.log(
        `Skipping continueMatching for ${bookingId} — active offer pending`,
      );
      return;
    }

    if (booking.matchingAttempt !== attempt) {
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { matchingAttempt: attempt },
      });
    }

    if (booking.dispatchStatus === DispatchStatus.OFFERING) {
      await this.dispatchState.transition(bookingId, {
        from: DispatchStatus.OFFERING,
        to: DispatchStatus.PENDING_MATCH,
        eventType: DISPATCH_EVENT_TYPES.CANDIDATES_SEARCHED,
        payload: { phase: 'resume_search', tier: attempt },
      });
    }

    const services = normalizeBookingServices(booking.services);
    const requiredServiceIds = extractHomeServiceIds(services);

    if (!requiredServiceIds.length) {
      this.logger.warn(`Booking ${bookingId} has no home service items`);
      return;
    }

    const coordinates = await this.resolveBookingCoordinates(booking);
    if (!coordinates) {
      this.logger.error(
        `Booking ${bookingId} has no geocoded address — cannot match beauticians`,
      );
      return;
    }

    const settings = await this.settingsService.getSettings();
    const excludeIds = await this.offerExclusion.getExcludedBeauticianIds(
      bookingId,
    );
    const rotateAfterBeauticianUserId =
      await this.offerExclusion.getLastOfferedBeauticianUserId(bookingId);
    const radiusKm = this.matchingConfig.resolveRadiusKm(attempt);

    this.logger.log(
      `Matching booking ${bookingId} attempt ${attempt}/${maxAttempts} within ${radiusKm}km`,
    );

    const searchContext = {
      customerLat: coordinates.lat,
      customerLng: coordinates.lng,
      requiredServiceIds,
      excludeIds,
      tierRadiusKm: radiusKm,
    };

    const candidate = await this.candidateFinder.getNextCandidate({
      bookingId,
      matchingAttempt: attempt,
      customerLat: coordinates.lat,
      customerLng: coordinates.lng,
      radiusKm,
      requiredServiceIds,
      excludeBeauticianUserIds: excludeIds,
      rotateAfterBeauticianUserId,
    });

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.CANDIDATES_SEARCHED,
      {
        tier: attempt,
        radiusKm,
        candidateCount: candidate ? 1 : 0,
        excludedCount: excludeIds.length,
        rotateAfterBeauticianUserId,
      },
    );

    const homeServiceAmount = sumHomeServiceAmount(services);

    if (!candidate) {
      await this.handleNoCandidate(bookingId, attempt, searchContext);
      return;
    }

    await this.offerManager.createNextOffer({
      bookingId,
      matchingAttempt: attempt,
      candidate,
      homeServiceAmount,
      globalCommissionRate: Number(settings.commissionRate),
      offerTtlSeconds: this.matchingConfig.getOfferTtlSeconds(attempt),
    });
  }

  async expireOffer(offerId: string, bookingId: string, matchingAttempt: number) {
    const now = new Date();

    const expired = await this.prisma.jobOffer.updateMany({
      where: {
        id: offerId,
        bookingId,
        status: JobOfferStatus.OFFERED,
      },
      data: {
        status: JobOfferStatus.EXPIRED,
        respondedAt: now,
      },
    });

    if (expired.count === 0) {
      return;
    }

    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
      select: { beauticianUserId: true },
    });

    if (offer) {
      await this.offerManager.releaseBeauticianToOnline(offer.beauticianUserId);
      this.realtimePublisher.emitOfferExpired(offer.beauticianUserId, bookingId);
    }

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.OFFER_EXPIRED,
      { offerId, tier: matchingAttempt },
      `expire:${offerId}`,
    );

    await this.continueMatching(bookingId, matchingAttempt);
  }

  /** Handles stale batch-expiry queue jobs; forwards to continueMatching. */
  async expireOffersForBooking(bookingId: string, matchingAttempt = 1) {
    const now = new Date();

    const expiringOffers = await this.prisma.jobOffer.findMany({
      where: {
        bookingId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { lte: now },
      },
      select: { id: true, beauticianUserId: true },
    });

    if (!expiringOffers.length) {
      return;
    }

    await this.prisma.jobOffer.updateMany({
      where: {
        bookingId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { lte: now },
      },
      data: {
        status: JobOfferStatus.EXPIRED,
        respondedAt: now,
      },
    });

    for (const offer of expiringOffers) {
      await this.offerManager.releaseBeauticianToOnline(offer.beauticianUserId);
      this.realtimePublisher.emitOfferExpired(offer.beauticianUserId, bookingId);
    }

    await this.continueMatching(bookingId, matchingAttempt);
  }

  async cancelBeauticianPendingOffers(beauticianUserId: string) {
    const now = new Date();

    const pendingOffers = await this.prisma.jobOffer.findMany({
      where: {
        beauticianUserId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { gt: now },
      },
      select: { id: true, bookingId: true },
    });

    if (!pendingOffers.length) {
      return;
    }

    await this.prisma.jobOffer.updateMany({
      where: {
        id: { in: pendingOffers.map((offer) => offer.id) },
        status: JobOfferStatus.OFFERED,
      },
      data: {
        status: JobOfferStatus.CANCELLED,
        respondedAt: now,
      },
    });

    await this.offerManager.releaseBeauticianToOnline(beauticianUserId);

    for (const offer of pendingOffers) {
      const job = await this.matchingQueue.getJob(`expire-offer:${offer.id}`);
      if (job) {
        await job.remove();
      }

      const booking = await this.prisma.booking.findUnique({
        where: { id: offer.bookingId },
        select: { matchingAttempt: true, status: true, matchingExhaustedAt: true },
      });

      if (
        booking &&
        booking.status === BookingStatus.PENDING_ASSIGNMENT &&
        !booking.matchingExhaustedAt
      ) {
        await this.continueMatching(offer.bookingId, booking.matchingAttempt);
      }
    }
  }

  async retryMatching(
    bookingId: string,
    source: 'customer' | 'admin' = 'customer',
    startAtTier = 1,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        matchingExhaustedAt: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.PENDING_ASSIGNMENT) {
      throw new BadRequestException(
        'Matching can only be retried for bookings awaiting beautician assignment',
      );
    }

    const maxAttempts = this.matchingConfig.getMaxAttempts();
    if (startAtTier < 1 || startAtTier > maxAttempts) {
      throw new BadRequestException(
        `startAtTier must be between 1 and ${maxAttempts}`,
      );
    }

    await this.cancelPendingMatchingJobs(bookingId);

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        matchingAttempt: startAtTier,
        matchingExhaustedAt: null,
        matchingExhaustedReason: null,
        dispatchStatus: DispatchStatus.PENDING_MATCH,
      },
    });

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.MANUAL_RETRY,
      { source, startAtTier },
      `retry:${bookingId}:${Date.now()}`,
    );

    await this.matchingQueue.add(
      'create-offers',
      { bookingId, matchingAttempt: startAtTier },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );

    this.logger.warn(
      `Matching manually re-triggered for booking ${bookingId} at tier ${startAtTier}`,
    );

    return {
      bookingId,
      matchingAttempt: startAtTier,
      message: `Beautician matching has been restarted at tier ${startAtTier}.`,
    };
  }

  async tryWakeExhaustedBooking(
    bookingId: string,
    source: string,
  ): Promise<boolean> {
    if (!this.matchingConfig.isWakeExhaustedOnOnlineEnabled()) {
      return false;
    }

    const dedupeKey = bookingExhaustedWakeRetryKey(bookingId);
    const allowed = await this.redis.setNx(dedupeKey, source, 7 * 24 * 60 * 60);
    if (!allowed) {
      return false;
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        matchingExhaustedAt: true,
      },
    });

    if (
      !booking ||
      booking.status !== BookingStatus.PENDING_ASSIGNMENT ||
      !booking.matchingExhaustedAt
    ) {
      return false;
    }

    await this.cancelPendingMatchingJobs(bookingId);

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        matchingAttempt: 1,
        matchingExhaustedAt: null,
        matchingExhaustedReason: null,
        dispatchStatus: DispatchStatus.PENDING_MATCH,
      },
    });

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.EXHAUSTED_WAKE_RETRY,
      { source },
      `exhausted-wake:${bookingId}`,
    );

    await this.matchingQueue.add(
      'create-offers',
      { bookingId, matchingAttempt: 1 },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        jobId: `matching-exhausted-wake:${bookingId}:${Date.now()}`,
      },
    );

    this.logger.log(
      `Auto-retrying exhausted booking ${bookingId} after ${source}`,
    );

    return true;
  }

  async triggerImmediateMatching(
    bookingId: string,
    source: string,
  ): Promise<boolean> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        matchingExhaustedAt: true,
        matchingAttempt: true,
      },
    });

    if (
      !booking ||
      booking.status !== BookingStatus.PENDING_ASSIGNMENT ||
      booking.matchingExhaustedAt
    ) {
      return false;
    }

    if (await this.hasActiveOffers(bookingId)) {
      return false;
    }

    await this.cancelPendingMatchingJobs(bookingId);

    await this.matchingQueue.add(
      'create-offers',
      {
        bookingId,
        matchingAttempt: booking.matchingAttempt,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        jobId: `matching-immediate:${bookingId}:${Date.now()}`,
      },
    );

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.BEAUTICIAN_ONLINE_RETRIGGER,
      { source, matchingAttempt: booking.matchingAttempt },
    );

    this.logger.log(
      `Queued immediate matching for booking ${bookingId} via ${source}`,
    );

    return true;
  }

  async clearActiveOffersAndJobs(bookingId: string) {
    const now = new Date();
    const activeOffers = await this.prisma.jobOffer.findMany({
      where: {
        bookingId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { gt: now },
      },
      select: { id: true, beauticianUserId: true },
    });

    if (activeOffers.length) {
      await this.prisma.jobOffer.updateMany({
        where: {
          id: { in: activeOffers.map((offer) => offer.id) },
          status: JobOfferStatus.OFFERED,
        },
        data: {
          status: JobOfferStatus.CANCELLED,
          respondedAt: now,
        },
      });

      for (const offer of activeOffers) {
        await this.offerManager.releaseBeauticianToOnline(offer.beauticianUserId);
        const job = await this.matchingQueue.getJob(`expire-offer:${offer.id}`);
        if (job) {
          await job.remove();
        }
        this.realtimePublisher.emitOfferExpired(
          offer.beauticianUserId,
          bookingId,
        );
      }
    }

    await this.cancelPendingMatchingJobs(bookingId);
  }

  async cancelDispatchForBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        dispatchStatus: true,
      },
    });

    if (
      !booking ||
      booking.status !== BookingStatus.PENDING_ASSIGNMENT ||
      (booking.dispatchStatus !== DispatchStatus.PENDING_MATCH &&
        booking.dispatchStatus !== DispatchStatus.OFFERING)
    ) {
      return;
    }

    await this.clearActiveOffersAndJobs(bookingId);

    await this.dispatchState.transition(bookingId, {
      from: booking.dispatchStatus ?? undefined,
      to: DispatchStatus.CANCELLED,
      eventType: DISPATCH_EVENT_TYPES.DISPATCH_CANCELLED,
      idempotencyKey: `dispatch-cancelled:${bookingId}`,
    });
  }

  private async handleNoCandidate(
    bookingId: string,
    attempt: number,
    searchContext: {
      customerLat: number;
      customerLng: number;
      requiredServiceIds: string[];
      excludeIds: string[];
      tierRadiusKm: number;
    },
  ) {
    const declinedIds = await this.offerExclusion.getDeclinedBeauticianIds(
      bookingId,
    );
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

  private async scheduleSameTierRetry(bookingId: string, attempt: number) {
    const delaySeconds = this.matchingConfig.getInterTierDelaySeconds();
    const delayMs = delaySeconds * 1000;

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.CANDIDATES_SEARCHED,
      {
        tier: attempt,
        phase: 'wait_for_online_candidates',
        delaySeconds,
      },
      `wait-online:${bookingId}:${Date.now()}`,
    );

    await this.matchingQueue.add(
      'create-offers',
      { bookingId, matchingAttempt: attempt },
      {
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        jobId: `matching-wait-online:${bookingId}:${Date.now()}`,
      },
    );

    this.logger.log(
      `Scheduled same-tier retry for booking ${bookingId} (tier ${attempt}) in ${delaySeconds}s — waiting for online beauticians`,
    );
  }

  private async scheduleNextMatchingAttempt(
    bookingId: string,
    currentAttempt: number,
    searchContext: {
      customerLat: number;
      customerLng: number;
      requiredServiceIds: string[];
      excludeIds: string[];
      tierRadiusKm: number;
    },
  ) {
    const nextAttempt = currentAttempt + 1;
    const maxAttempts = this.matchingConfig.getMaxAttempts();

    if (nextAttempt > maxAttempts) {
      await this.markMatchingExhaustedFromContext(bookingId, searchContext);
      return;
    }

    const delaySeconds = this.matchingConfig.getInterTierDelaySeconds();
    const delayMs = delaySeconds * 1000;

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.TIER_ESCALATED,
      {
        fromTier: currentAttempt,
        toTier: nextAttempt,
        delaySeconds: delaySeconds,
      },
      `tier:${bookingId}:${nextAttempt}`,
    );

    await this.matchingQueue.add(
      'create-offers',
      { bookingId, matchingAttempt: nextAttempt },
      {
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );

    this.logger.log(
      `Scheduled matching attempt ${nextAttempt} for booking ${bookingId} in ${delaySeconds} second(s)`,
    );
  }

  private async markMatchingExhausted(
    bookingId: string,
    reason: MatchingExhaustedReason,
  ) {
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

  private async hadOffersInBooking(bookingId: string) {
    const count = await this.prisma.jobOffer.count({
      where: { bookingId },
    });

    return count > 0;
  }

  private async markMatchingExhaustedFromContext(
    bookingId: string,
    searchContext: {
      customerLat: number;
      customerLng: number;
      requiredServiceIds: string[];
      excludeIds: string[];
      tierRadiusKm: number;
    },
  ) {
    const stats = await this.poolAnalyzer.analyze({
      customerLat: searchContext.customerLat,
      customerLng: searchContext.customerLng,
      tierRadiusKm: searchContext.tierRadiusKm,
      maxRadiusKm: this.matchingConfig.getMaxRadiusKm(),
      requiredServiceIds: searchContext.requiredServiceIds,
      excludeBeauticianUserIds: searchContext.excludeIds,
    });

    const reason = this.exhaustionResolver.resolve({
      stats,
      hadOffersInBooking: await this.hadOffersInBooking(bookingId),
    });

    await this.markMatchingExhausted(bookingId, reason);
  }

  private async hasActiveOffers(bookingId: string): Promise<boolean> {
    const count = await this.prisma.jobOffer.count({
      where: {
        bookingId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { gt: new Date() },
      },
    });

    return count > 0;
  }

  private async cancelPendingMatchingJobs(bookingId: string) {
    const jobs = await this.matchingQueue.getJobs(['delayed', 'waiting', 'paused']);

    await Promise.all(
      jobs
        .filter(
          (job) =>
            job.data?.bookingId === bookingId &&
            (job.name === 'create-offers' ||
              job.name === 'expire-offers' ||
              job.name === 'expire-offer'),
        )
        .map((job) => job.remove()),
    );
  }

  /**
   * Resolve customer coords from temporary booking location first, then saved
   * address (with optional geocoding fallback).
   */
  private async resolveBookingCoordinates(booking: {
    tempLatitude?: unknown;
    tempLongitude?: unknown;
    tempFullAddress?: string | null;
    address: {
      latitude: unknown;
      longitude: unknown;
      fullAddress: string;
      placeId: string | null;
    } | null;
  }): Promise<{ lat: number; lng: number } | null> {
    if (booking.tempLatitude != null && booking.tempLongitude != null) {
      return {
        lat: Number(booking.tempLatitude),
        lng: Number(booking.tempLongitude),
      };
    }

    return this.resolveCoordinates(booking.address);
  }

  private async resolveCoordinates(
    address: {
      latitude: unknown;
      longitude: unknown;
      fullAddress: string;
      placeId: string | null;
    } | null,
  ): Promise<{ lat: number; lng: number } | null> {
    if (!address) return null;

    if (address.latitude != null && address.longitude != null) {
      return {
        lat: Number(address.latitude),
        lng: Number(address.longitude),
      };
    }

    if (address.placeId) {
      const geo = await this.geocodingService.geocodeByPlaceId(address.placeId);
      if (geo) return { lat: geo.latitude, lng: geo.longitude };
    }

    const geo = await this.geocodingService.geocodeAddress(address.fullAddress);
    return geo ? { lat: geo.latitude, lng: geo.longitude } : null;
  }
}