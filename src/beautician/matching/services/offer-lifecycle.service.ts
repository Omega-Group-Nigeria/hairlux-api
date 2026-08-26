import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus, JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OfferManagerService } from './offer-manager.service';
import { DispatchStateService } from './dispatch-state.service';
import { DISPATCH_EVENT_TYPES } from '../constants/dispatch-event.constants';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';
import { MatchingQueueService } from './matching-queue.service';

export type ExpiredOfferResult = {
  expired: boolean;
  beauticianUserId?: string;
};

/**
 * Centralizes offer expire / cancel / clear flows so the orchestrator
 * does not duplicate status updates, release, queue cleanup, or realtime emits.
 */
@Injectable()
export class OfferLifecycleService {
  private readonly logger = new Logger(OfferLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offerManager: OfferManagerService,
    private readonly dispatchState: DispatchStateService,
    private readonly realtimePublisher: RealtimePublisherService,
    private readonly matchingQueue: MatchingQueueService,
  ) {}

  async hasActiveOffers(bookingId: string): Promise<boolean> {
    const count = await this.countActiveOffers(bookingId);
    return count > 0;
  }

  async countActiveOffers(bookingId: string): Promise<number> {
    return this.prisma.jobOffer.count({
      where: {
        bookingId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async expireOffer(
    offerId: string,
    bookingId: string,
    matchingAttempt: number,
  ): Promise<ExpiredOfferResult> {
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
      return { expired: false };
    }

    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
      select: { beauticianUserId: true },
    });

    if (offer) {
      await this.releaseAndNotify(offer.beauticianUserId, bookingId);
    }

    await this.matchingQueue.removeExpireOfferJob(offerId);
    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.OFFER_EXPIRED,
      { offerId, tier: matchingAttempt },
      `expire:${offerId}`,
    );

    return {
      expired: true,
      beauticianUserId: offer?.beauticianUserId,
    };
  }

  async expireStaleOffersForBooking(bookingId: string): Promise<number> {
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
      return 0;
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
      await this.releaseAndNotify(offer.beauticianUserId, bookingId);
      await this.matchingQueue.removeExpireOfferJob(offer.id);
    }

    return expiringOffers.length;
  }

  /**
   * Cancel all OFFERED jobs for a beautician (e.g. went offline).
   * Returns booking IDs that should resume matching.
   */
  async cancelBeauticianPendingOffers(
    beauticianUserId: string,
  ): Promise<Array<{ bookingId: string; matchingAttempt: number }>> {
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
      return [];
    }

    await this.prisma.jobOffer.updateMany({
      where: {
        id: { in: pendingOffers.map((o) => o.id) },
        status: JobOfferStatus.OFFERED,
      },
      data: {
        status: JobOfferStatus.CANCELLED,
        respondedAt: now,
      },
    });

    await this.offerManager.releaseBeauticianToOnline(beauticianUserId);

    const resume: Array<{ bookingId: string; matchingAttempt: number }> = [];

    for (const offer of pendingOffers) {
      await this.matchingQueue.removeExpireOfferJob(offer.id);

      const booking = await this.prisma.booking.findUnique({
        where: { id: offer.bookingId },
        select: {
          matchingAttempt: true,
          status: true,
          matchingExhaustedAt: true,
        },
      });

      if (
        booking &&
        booking.status === BookingStatus.PENDING_ASSIGNMENT &&
        !booking.matchingExhaustedAt
      ) {
        resume.push({
          bookingId: offer.bookingId,
          matchingAttempt: booking.matchingAttempt,
        });
      }
    }

    return resume;
  }

  async clearActiveOffersAndJobs(bookingId: string): Promise<void> {
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
          id: { in: activeOffers.map((o) => o.id) },
          status: JobOfferStatus.OFFERED,
        },
        data: {
          status: JobOfferStatus.CANCELLED,
          respondedAt: now,
        },
      });

      for (const offer of activeOffers) {
        await this.releaseAndNotify(offer.beauticianUserId, bookingId);
        await this.matchingQueue.removeExpireOfferJob(offer.id);
      }
    }

    await this.matchingQueue.cancelBookingJobs(bookingId);
  }

  private async releaseAndNotify(
    beauticianUserId: string,
    bookingId: string,
  ): Promise<void> {
    await this.offerManager.releaseBeauticianToOnline(beauticianUserId);
    this.realtimePublisher.emitOfferExpired(beauticianUserId, bookingId);
  }

  /**
   * When one beautician accepts, release other concurrent offer holders:
   * restore availability, cancel expiry jobs, and notify via WebSocket.
   */
  async releaseOfferLosers(
    losers: Array<{ offerId: string; beauticianUserId: string }>,
    bookingId: string,
  ): Promise<void> {
    for (const loser of losers) {
      await this.offerManager.releaseBeauticianToOnline(loser.beauticianUserId);
      await this.matchingQueue.removeExpireOfferJob(loser.offerId);
      this.realtimePublisher.emitOfferExpired(loser.beauticianUserId, bookingId);
    }
  }
}
