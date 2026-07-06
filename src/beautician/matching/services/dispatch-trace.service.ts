import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DispatchTraceService {
  constructor(private readonly prisma: PrismaService) {}

  async getTrace(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        dispatchStatus: true,
        matchingAttempt: true,
        matchingStartedAt: true,
        matchingExhaustedAt: true,
        matchingExhaustedReason: true,
        assignedBeauticianUserId: true,
        dispatchEvents: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            eventType: true,
            payload: true,
            createdAt: true,
          },
        },
        jobOffers: {
          orderBy: { offeredAt: 'asc' },
          select: {
            id: true,
            beauticianUserId: true,
            status: true,
            offeredAt: true,
            respondedAt: true,
            expiresAt: true,
            tier: true,
            distanceKmAtOffer: true,
            estEarningsAtOffer: true,
            declineReason: true,
            scoreSnapshot: true,
            beautician: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return {
      bookingId: booking.id,
      bookingStatus: booking.status,
      dispatchStatus: booking.dispatchStatus,
      matchingAttempt: booking.matchingAttempt,
      matchingStartedAt: booking.matchingStartedAt,
      matchingExhaustedAt: booking.matchingExhaustedAt,
      matchingExhaustedReason: booking.matchingExhaustedReason,
      assignedBeauticianUserId: booking.assignedBeauticianUserId,
      events: booking.dispatchEvents,
      offers: booking.jobOffers.map((offer) => ({
        ...offer,
        distanceKmAtOffer: offer.distanceKmAtOffer
          ? Number(offer.distanceKmAtOffer)
          : null,
        estEarningsAtOffer: offer.estEarningsAtOffer
          ? Number(offer.estEarningsAtOffer)
          : null,
      })),
    };
  }
}