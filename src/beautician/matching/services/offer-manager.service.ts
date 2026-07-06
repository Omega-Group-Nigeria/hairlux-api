import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  AvailabilityStatus,
  DispatchStatus,
  JobOfferStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DispatchStateService } from './dispatch-state.service';
import { DISPATCH_EVENT_TYPES } from '../constants/dispatch-event.constants';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { HOME_SERVICE_MATCHING_QUEUE } from '../../home-service-booking/home-service-booking.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';
import { MatchingCandidate } from './candidate-finder.service';
import { BeauticianLocationIndexService } from './beautician-location-index.service';

@Injectable()
export class OfferManagerService {
  private readonly logger = new Logger(OfferManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchState: DispatchStateService,
    @InjectQueue(HOME_SERVICE_MATCHING_QUEUE)
    private readonly matchingQueue: Queue,
    private readonly notificationService: BeauticianNotificationService,
    private readonly realtimePublisher: RealtimePublisherService,
    private readonly locationIndex: BeauticianLocationIndexService,
  ) {}

  async createNextOffer(params: {
    bookingId: string;
    matchingAttempt: number;
    candidate: MatchingCandidate;
    homeServiceAmount: number;
    globalCommissionRate: number;
    offerTtlSeconds: number;
  }) {
    const expiresAt = new Date(
      Date.now() + params.offerTtlSeconds * 1000,
    );
    const rate =
      params.candidate.commissionRateOverride ?? params.globalCommissionRate;
    const estEarnings = params.homeServiceAmount * rate;

    type CreatedOffer = {
      id: string;
      beauticianUserId: string;
      expiresAt: Date;
      estEarningsAtOffer: Prisma.Decimal | null;
      distanceKmAtOffer: Prisma.Decimal | null;
      beautician: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
      };
    };

    const offer = await this.prisma.$transaction(async (tx) => {
      const activeOffer = await tx.jobOffer.findFirst({
        where: {
          bookingId: params.bookingId,
          status: JobOfferStatus.OFFERED,
          expiresAt: { gt: new Date() },
        },
      });

      if (activeOffer) {
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
          scoreSnapshot: params.candidate.scoreSnapshot as Prisma.InputJsonValue,
        },
        include: {
          beautician: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
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
        `Skipped duplicate offer creation for booking ${params.bookingId}`,
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

    await this.matchingQueue.add(
      'expire-offer',
      {
        offerId: offer.id,
        bookingId: params.bookingId,
        matchingAttempt: params.matchingAttempt,
      },
      {
        delay: params.offerTtlSeconds * 1000,
        jobId: `expire-offer:${offer.id}`,
        removeOnComplete: true,
      },
    );

    await this.notificationService.notifyNewJobOffer(
      {
        id: offer.beautician.id,
        email: offer.beautician.email,
        firstName: offer.beautician.firstName ?? '',
        lastName: offer.beautician.lastName ?? '',
      },
      params.bookingId,
      Number(offer.estEarningsAtOffer ?? 0),
    );

    this.realtimePublisher.emitJobOffer(offer.beauticianUserId, {
      offerId: offer.id,
      bookingId: params.bookingId,
      estEarnings: Number(offer.estEarningsAtOffer ?? 0),
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

    await this.prisma.beauticianProfile.update({
      where: { userId: beauticianUserId },
      data: { availabilityStatus: AvailabilityStatus.ONLINE },
    });

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