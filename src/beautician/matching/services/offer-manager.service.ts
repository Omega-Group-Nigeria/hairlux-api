import { Injectable, Logger } from '@nestjs/common';
import {
  AvailabilityStatus,
  BookingStatus,
  DispatchStatus,
  JobOfferStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DispatchStateService } from './dispatch-state.service';
import { DISPATCH_EVENT_TYPES } from '../constants/dispatch-event.constants';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';
import { MatchingCandidate } from './candidate-finder.service';
import { BeauticianLocationIndexService } from './beautician-location-index.service';
import { MatchingQueueService } from './matching-queue.service';
import { MatchingConfigService } from './matching-config.service';
import { JobPushNotifier } from '../../../notifications/job/job-push.notifier';

@Injectable()
export class OfferManagerService {
  private readonly logger = new Logger(OfferManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchState: DispatchStateService,
    private readonly matchingQueueService: MatchingQueueService,
    private readonly realtimePublisher: RealtimePublisherService,
    private readonly locationIndex: BeauticianLocationIndexService,
    private readonly matchingConfig: MatchingConfigService,
    private readonly jobPushNotifier: JobPushNotifier,
  ) {}

  async createNextOffer(params: {
    bookingId: string;
    matchingAttempt: number;
    candidate: MatchingCandidate;
    /** Pre-calculated beautician take-home for this booking. */
    estEarnings: number;
    offerTtlSeconds: number;
  }) {
    const expiresAt = new Date(Date.now() + params.offerTtlSeconds * 1000);
    const estEarnings = params.estEarnings;
    const maxConcurrent = this.matchingConfig.getConcurrentOffers();

    type CreatedOffer = {
      id: string;
      beauticianUserId: string;
      expiresAt: Date;
      estEarningsAtOffer: Prisma.Decimal | null;
      distanceKmAtOffer: Prisma.Decimal | null;
    };

    const offer = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const activeCount = await tx.jobOffer.count({
        where: {
          bookingId: params.bookingId,
          status: JobOfferStatus.OFFERED,
          expiresAt: { gt: now },
        },
      });

      if (activeCount >= maxConcurrent) {
        return null;
      }

      const alreadyOffered = await tx.jobOffer.findFirst({
        where: {
          bookingId: params.bookingId,
          beauticianUserId: params.candidate.userId,
          status: JobOfferStatus.OFFERED,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });

      if (alreadyOffered) {
        return null;
      }

      const created = await tx.jobOffer.create({
        data: {
          bookingId: params.bookingId,
          beauticianUserId: params.candidate.userId,
          status: JobOfferStatus.OFFERED,
          expiresAt,
          tier: params.matchingAttempt,
          distanceKmAtOffer: params.candidate.distanceKm,
          estEarningsAtOffer: estEarnings,
          scoreSnapshot: params.candidate
            .scoreSnapshot as Prisma.InputJsonValue,
        },
      });

      await tx.beauticianProfile.update({
        where: { userId: params.candidate.userId },
        data: { availabilityStatus: AvailabilityStatus.OFFERED },
      });

      return created as CreatedOffer;
    });

    if (!offer) {
      this.logger.log(
        `Skipped offer creation for booking ${params.bookingId} (at concurrent cap ${maxConcurrent} or already offered)`,
      );
      return null;
    }

    await this.dispatchState.transition(params.bookingId, {
      to: DispatchStatus.OFFERING,
      eventType: DISPATCH_EVENT_TYPES.OFFER_SENT,
      payload: {
        offerId: offer.id,
        beauticianUserId: offer.beauticianUserId,
        tier: params.matchingAttempt,
        distanceKm: params.candidate.distanceKm,
        expiresAt: expiresAt.toISOString(),
      },
      idempotencyKey: `offer:${offer.id}`,
    });

    await this.matchingQueueService.scheduleExpireOffer({
      offerId: offer.id,
      bookingId: params.bookingId,
      matchingAttempt: params.matchingAttempt,
      delayMs: params.offerTtlSeconds * 1000,
    });

    const estEarningsNum = Number(offer.estEarningsAtOffer ?? 0);

    const booking = await this.prisma.booking.findUnique({
      where: { id: params.bookingId },
      select: { reservationCode: true },
    });

    this.jobPushNotifier.notifyOffer({
      beauticianUserId: offer.beauticianUserId,
      bookingId: params.bookingId,
      offerId: offer.id,
      estEarnings: estEarningsNum,
      bookingCode: booking?.reservationCode ?? null,
      distanceKm: offer.distanceKmAtOffer ? Number(offer.distanceKmAtOffer) : params.candidate.distanceKm ?? null,
      expiresAt: offer.expiresAt.toISOString(),
    });

    this.realtimePublisher.emitJobOffer(offer.beauticianUserId, {
      offerId: offer.id,
      bookingId: params.bookingId,
      bookingCode: booking?.reservationCode ?? null,
      estEarnings: estEarningsNum,
      expiresAt: offer.expiresAt.toISOString(),
      distanceKm: offer.distanceKmAtOffer
        ? Number(offer.distanceKmAtOffer)
        : null,
    });

    await this.locationIndex.remove(params.candidate.userId);

    this.logger.log(
      `Offer ${offer.id} sent to beautician ${offer.beauticianUserId} for booking ${params.bookingId} (tier ${params.matchingAttempt})`,
    );

    return offer;
  }

  /**
   * After decline / expire / cancel of an offer: restore prior operational state.
   * If they still have an active job → ON_JOB (stay out of free geo index).
   * Otherwise → ONLINE and re-index for free matching.
   * Uses conditional OFFERED→next update so concurrent release/accept cannot clobber state.
   */
  async releaseBeauticianToOnline(beauticianUserId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId: beauticianUserId },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });

    if (!profile || profile.availabilityStatus !== AvailabilityStatus.OFFERED) {
      return;
    }

    const activeJob = await this.prisma.booking.findFirst({
      where: {
        assignedBeauticianUserId: beauticianUserId,
        status: {
          in: [
            BookingStatus.ASSIGNED,
            BookingStatus.EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.ARRIVED_VERIFIED,
            BookingStatus.IN_PROGRESS,
            BookingStatus.AWAITING_CUSTOMER_CONFIRM,
          ],
        },
      },
      select: { id: true },
    });

    if (activeJob) {
      const moved = await this.prisma.beauticianProfile.updateMany({
        where: {
          userId: beauticianUserId,
          availabilityStatus: AvailabilityStatus.OFFERED,
        },
        data: { availabilityStatus: AvailabilityStatus.ON_JOB },
      });
      if (moved.count === 1) {
        await this.locationIndex.remove(beauticianUserId);
      }
      return;
    }

    const moved = await this.prisma.beauticianProfile.updateMany({
      where: {
        userId: beauticianUserId,
        availabilityStatus: AvailabilityStatus.OFFERED,
      },
      data: { availabilityStatus: AvailabilityStatus.ONLINE },
    });

    if (moved.count !== 1) {
      return;
    }

    if (profile.currentLat != null && profile.currentLng != null) {
      await this.locationIndex.upsertOnline({
        userId: beauticianUserId,
        lat: Number(profile.currentLat),
        lng: Number(profile.currentLng),
        serviceIds: profile.assignedServices.map((item) => item.serviceId),
        updatedAt: profile.lastLocationUpdate ?? profile.updatedAt,
      });
    }
  }
}
