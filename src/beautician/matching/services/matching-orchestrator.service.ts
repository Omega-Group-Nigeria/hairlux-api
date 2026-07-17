import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  DispatchStatus,
  MatchingExhaustedReason,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeBookingServices } from '../../../booking/utils/booking.utils';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { extractHomeServiceIds } from '../utils/booking-assignment.utils';
import { MatchingConfigService } from './matching-config.service';
import { CandidateFinderService } from './candidate-finder.service';
import { OfferExclusionService } from './offer-exclusion.service';
import { OfferManagerService } from './offer-manager.service';
import { DispatchStateService } from './dispatch-state.service';
import { DISPATCH_EVENT_TYPES } from '../constants/dispatch-event.constants';
import { RedisService } from '../../../redis/redis.service';
import { bookingExhaustedWakeRetryKey } from '../constants/location-index.constants';
import { EarningsCalculatorService } from '../../payout/services/earnings-calculator.service';
import { ServiceCommissionRateService } from '../../payout/services/service-commission-rate.service';
import { MatchingLockService } from './matching-lock.service';
import { MatchingQueueService } from './matching-queue.service';
import { BookingCoordinatesService } from './booking-coordinates.service';
import { OfferLifecycleService } from './offer-lifecycle.service';
import { MatchingAttemptService } from './matching-attempt.service';
import { matchingJobIds } from '../constants/matching-queue.constants';

/**
 * Thin coordinator for home-service matching.
 * Heavy work lives in focused collaborators (lock, queue, coords, lifecycle, attempts).
 */
@Injectable()
export class MatchingOrchestratorService {
  private readonly logger = new Logger(MatchingOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly matchingConfig: MatchingConfigService,
    private readonly candidateFinder: CandidateFinderService,
    private readonly offerExclusion: OfferExclusionService,
    private readonly offerManager: OfferManagerService,
    private readonly dispatchState: DispatchStateService,
    private readonly redis: RedisService,
    private readonly earningsCalculator: EarningsCalculatorService,
    private readonly serviceCommissionRates: ServiceCommissionRateService,
    private readonly matchingLock: MatchingLockService,
    private readonly matchingQueue: MatchingQueueService,
    private readonly bookingCoordinates: BookingCoordinatesService,
    private readonly offerLifecycle: OfferLifecycleService,
    private readonly matchingAttempts: MatchingAttemptService,
  ) {}

  async createOffersForBooking(
    bookingId: string,
    matchingAttempt = 1,
  ): Promise<void> {
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

  /**
   * Core matching step. Protected by a per-booking Redis lock so concurrent
   * triggers (queue, expire, wake, retry) cannot race.
   */
  async continueMatching(
    bookingId: string,
    matchingAttempt?: number,
  ): Promise<void> {
    const ran = await this.matchingLock.runExclusive(bookingId, () =>
      this.runMatchingPass(bookingId, matchingAttempt),
    );
    if (ran === null) {
      this.logger.log(
        `continueMatching skipped for ${bookingId} — lock not acquired`,
      );
    }
  }

  async expireOffer(
    offerId: string,
    bookingId: string,
    matchingAttempt: number,
  ): Promise<void> {
    const result = await this.offerLifecycle.expireOffer(
      offerId,
      bookingId,
      matchingAttempt,
    );
    if (!result.expired) {
      return;
    }
    await this.continueMatching(bookingId, matchingAttempt);
  }

  /** Handles stale batch-expiry queue jobs. */
  async expireOffersForBooking(
    bookingId: string,
    matchingAttempt = 1,
  ): Promise<void> {
    const count =
      await this.offerLifecycle.expireStaleOffersForBooking(bookingId);
    if (!count) {
      return;
    }
    await this.continueMatching(bookingId, matchingAttempt);
  }

  async cancelBeauticianPendingOffers(beauticianUserId: string): Promise<void> {
    const resume =
      await this.offerLifecycle.cancelBeauticianPendingOffers(beauticianUserId);

    for (const item of resume) {
      await this.continueMatching(item.bookingId, item.matchingAttempt);
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

    await this.matchingQueue.cancelBookingJobs(bookingId);

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

    await this.matchingQueue.scheduleCreateOffers(
      { bookingId, matchingAttempt: startAtTier },
      { jobId: matchingJobIds.manualRetry(bookingId) },
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

    await this.matchingQueue.cancelBookingJobs(bookingId);

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

    await this.matchingQueue.scheduleCreateOffers(
      { bookingId, matchingAttempt: 1 },
      { jobId: matchingJobIds.exhaustedWake(bookingId) },
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

    // Under queue-only path: skip if an active offer already exists (cheap gate).
    // Atomic create still guards TOCTOU inside OfferManager.
    if (await this.offerLifecycle.hasActiveOffers(bookingId)) {
      return false;
    }

    await this.matchingQueue.cancelBookingJobs(bookingId);

    await this.matchingQueue.scheduleCreateOffers(
      {
        bookingId,
        matchingAttempt: booking.matchingAttempt,
      },
      {
        jobId: matchingJobIds.immediate(
          bookingId,
          booking.matchingAttempt,
        ),
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

  async clearActiveOffersAndJobs(bookingId: string): Promise<void> {
    await this.offerLifecycle.clearActiveOffersAndJobs(bookingId);
  }

  async cancelDispatchForBooking(bookingId: string): Promise<void> {
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

    await this.offerLifecycle.clearActiveOffersAndJobs(bookingId);

    await this.dispatchState.transition(bookingId, {
      from: booking.dispatchStatus ?? undefined,
      to: DispatchStatus.CANCELLED,
      eventType: DISPATCH_EVENT_TYPES.DISPATCH_CANCELLED,
      idempotencyKey: `dispatch-cancelled:${bookingId}`,
    });
  }

  // ─── private matching pass ─────────────────────────────────────────────────

  private async runMatchingPass(
    bookingId: string,
    matchingAttempt?: number,
  ): Promise<void> {
    const booking = await this.loadMatchableBooking(bookingId);
    if (!booking) {
      return;
    }

    const attempt = matchingAttempt ?? booking.matchingAttempt;
    const maxAttempts = this.matchingConfig.getMaxAttempts();

    if (attempt > maxAttempts) {
      await this.matchingAttempts.markMatchingExhausted(
        bookingId,
        MatchingExhaustedReason.NO_CANDIDATES_IN_AREA,
      );
      return;
    }

    // Still useful as a fast path; OfferManager also enforces one active offer
    // atomically inside a transaction (TOCTOU-safe under lock + txn).
    if (await this.offerLifecycle.hasActiveOffers(bookingId)) {
      this.logger.log(
        `Skipping continueMatching for ${bookingId} — active offer pending`,
      );
      return;
    }

    await this.prepareAttemptState(booking, attempt);

    const requiredServiceIds = extractHomeServiceIds(
      normalizeBookingServices(booking.services),
    );
    if (!requiredServiceIds.length) {
      this.logger.warn(`Booking ${bookingId} has no home service items`);
      return;
    }

    const coordinates = await this.bookingCoordinates.resolve(booking);
    if (!coordinates) {
      this.logger.error(
        `Booking ${bookingId} has no geocoded address — cannot match beauticians`,
      );
      return;
    }

    const [settings, excludeIds, rotateAfterBeauticianUserId] =
      await Promise.all([
        this.settingsService.getSettings(),
        this.offerExclusion.getExcludedBeauticianIds(bookingId),
        this.offerExclusion.getLastOfferedBeauticianUserId(bookingId),
      ]);

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

    if (!candidate) {
      await this.matchingAttempts.handleNoCandidate(
        bookingId,
        attempt,
        searchContext,
      );
      return;
    }

    const estEarnings = await this.calculateEstEarnings({
      bookingType: booking.bookingType,
      services: booking.services,
      totalAmount: Number(booking.totalAmount),
      defaultCommissionRate: Number(settings.commissionRate),
      requiredServiceIds,
    });

    await this.offerManager.createNextOffer({
      bookingId,
      matchingAttempt: attempt,
      candidate,
      estEarnings,
      offerTtlSeconds: this.matchingConfig.getOfferTtlSeconds(attempt),
    });
  }

  private async loadMatchableBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { address: true },
    });

    if (!booking) {
      this.logger.warn(`continueMatching: booking ${bookingId} not found`);
      return null;
    }

    if (
      booking.status !== BookingStatus.PENDING_ASSIGNMENT ||
      booking.matchingExhaustedAt
    ) {
      this.logger.log(
        `continueMatching: booking ${bookingId} not matchable (status=${booking.status}, exhausted=${Boolean(booking.matchingExhaustedAt)})`,
      );
      return null;
    }

    return booking;
  }

  private async prepareAttemptState(
    booking: {
      id: string;
      matchingAttempt: number;
      dispatchStatus: DispatchStatus | null;
    },
    attempt: number,
  ): Promise<void> {
    if (booking.matchingAttempt !== attempt) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { matchingAttempt: attempt },
      });
    }

    if (booking.dispatchStatus === DispatchStatus.OFFERING) {
      await this.dispatchState.transition(booking.id, {
        from: DispatchStatus.OFFERING,
        to: DispatchStatus.PENDING_MATCH,
        eventType: DISPATCH_EVENT_TYPES.CANDIDATES_SEARCHED,
        payload: { phase: 'resume_search', tier: attempt },
      });
    }
  }

  private async calculateEstEarnings(params: {
    bookingType: Parameters<
      EarningsCalculatorService['calculate']
    >[0]['bookingType'];
    services: unknown;
    totalAmount: number;
    defaultCommissionRate: number;
    requiredServiceIds: string[];
  }): Promise<number> {
    const serviceCommissionRates =
      await this.serviceCommissionRates.getRateMapForServiceIds(
        params.requiredServiceIds,
      );

    const earnings = this.earningsCalculator.calculate({
      bookingType: params.bookingType,
      services: params.services,
      totalAmount: params.totalAmount,
      defaultCommissionRate: params.defaultCommissionRate,
      serviceCommissionRates,
    });

    return earnings.earningsAmount;
  }
}
