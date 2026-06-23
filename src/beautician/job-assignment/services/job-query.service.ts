import { Injectable } from '@nestjs/common';
import {
  AvailabilityStatus,
  BookingStatus,
  JobOfferStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { JobPresentationService } from './job-presentation.service';

@Injectable()
export class JobQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presentationService: JobPresentationService,
  ) {}

  async listAvailable(beauticianUserId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId: beauticianUserId },
      select: { availabilityStatus: true },
    });

    if (
      !profile ||
      profile.availabilityStatus !== AvailabilityStatus.ONLINE
    ) {
      return [];
    }

    const now = new Date();

    const offers = await this.prisma.jobOffer.findMany({
      where: {
        beauticianUserId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { gt: now },
        booking: { status: BookingStatus.PENDING_ASSIGNMENT },
      },
      orderBy: [{ distanceKmAtOffer: 'asc' }, { offeredAt: 'asc' }],
      include: {
        booking: {
          include: {
            address: {
              select: {
                fullAddress: true,
                city: true,
                state: true,
              },
            },
          },
        },
      },
    });

    return offers.map((offer) =>
      this.presentationService.buildAvailableOffer(offer),
    );
  }

  async listActive(beauticianUserId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        assignedBeauticianUserId: beauticianUserId,
        status: {
          in: [
            BookingStatus.ASSIGNED,
            BookingStatus.EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.ARRIVED_VERIFIED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      },
      include: this.presentationService.bookingInclude(),
      orderBy: { bookingDate: 'asc' },
    });

    return bookings.map((booking) =>
      this.presentationService.buildAcceptedResponse(booking),
    );
  }
}