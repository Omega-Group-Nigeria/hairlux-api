import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { MatchingCandidate } from './candidate-finder.service';
import { HOME_SERVICE_MATCHING_QUEUE } from '../../home-service-booking/home-service-booking.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';

@Injectable()
export class OfferFactoryService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(HOME_SERVICE_MATCHING_QUEUE)
    private readonly matchingQueue: Queue,
    private readonly notificationService: BeauticianNotificationService,
    private readonly realtimePublisher: RealtimePublisherService,
  ) {}

  async createOffers(params: {
    bookingId: string;
    candidates: MatchingCandidate[];
    homeServiceAmount: number;
    globalCommissionRate: number;
    timeoutMinutes: number;
  }) {
    if (!params.candidates.length) {
      return [];
    }

    const expiresAt = new Date(
      Date.now() + params.timeoutMinutes * 60 * 1000,
    );

    const offers = await this.prisma.$transaction(async (tx) => {
      const createdOffers = [];

      for (const candidate of params.candidates) {
        const rate =
          candidate.commissionRateOverride ?? params.globalCommissionRate;
        const estEarnings = params.homeServiceAmount * rate;

        const offer = await tx.jobOffer.create({
          data: {
            bookingId: params.bookingId,
            beauticianUserId: candidate.userId,
            status: JobOfferStatus.OFFERED,
            expiresAt,
            distanceKmAtOffer: candidate.distanceKm,
            estEarningsAtOffer: estEarnings,
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

        createdOffers.push(offer);
      }

      return createdOffers;
    });

    const delayMs = params.timeoutMinutes * 60 * 1000;
    await this.matchingQueue.add(
      'expire-offers',
      { bookingId: params.bookingId },
      { delay: delayMs, removeOnComplete: true },
    );

    await Promise.all(
      offers.map(async (offer) => {
        await this.notificationService.notifyNewJobOffer(
          offer.beautician,
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
      }),
    );

    return offers;
  }
}