import { Injectable } from '@nestjs/common';
import { BookingStatus, JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ACTIVE_HOME_SERVICE_STATUSES,
  BEAUTICIAN_JOB_HISTORY_STATUSES,
} from '../../home-service-booking/home-service-status.service';
import { QueryJobHistoryDto } from '../dto/query-job-history.dto';
import { JobPresentationService } from './job-presentation.service';
import { JobEarningsResolverService } from './job-earnings-resolver.service';

@Injectable()
export class JobQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presentationService: JobPresentationService,
    private readonly earningsResolver: JobEarningsResolverService,
  ) {}

  async listAvailable(beauticianUserId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId: beauticianUserId },
      select: { availabilityStatus: true },
    });

    // Unknown beautician: nothing to serve.
    if (!profile) {
      return [];
    }

    const now = new Date();

    // A live, unexpired OFFERED offer is the source of truth for an already
    // decided dispatch. Surface it regardless of the profile's momentary
    // availability state: offer creation flips the status to OFFERED, but a
    // racing/inconsistent state can still read OFFLINE here at poll time, and
    // hiding the offer would make the app silently drop the popup.
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
        status: { in: [...ACTIVE_HOME_SERVICE_STATUSES] },
      },
      include: this.presentationService.bookingInclude(),
      orderBy: { bookingDate: 'asc' },
    });

    const earningsByBookingId =
      await this.earningsResolver.resolveForActiveBookings(
        beauticianUserId,
        bookings,
      );

    return bookings.map((booking) =>
      this.presentationService.buildAcceptedResponse(
        booking,
        earningsByBookingId.get(booking.id),
      ),
    );
  }

  async listHistory(beauticianUserId: string, query: QueryJobHistoryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const statuses = query.status
      ? [query.status]
      : [...BEAUTICIAN_JOB_HISTORY_STATUSES];

    const where = {
      assignedBeauticianUserId: beauticianUserId,
      status: { in: statuses },
    };

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: this.presentationService.bookingInclude(),
        orderBy: [{ serviceCompletedAt: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const completedBookingIds = bookings
      .filter((booking) => booking.status === BookingStatus.COMPLETED)
      .map((booking) => booking.id);

    const earningsByBookingId = await this.loadEarningsByBookingId(
      completedBookingIds,
    );

    const items = bookings.map((booking) =>
      this.presentationService.buildHistoryResponse(booking, {
        earningsAmount:
          booking.status === BookingStatus.COMPLETED
            ? (earningsByBookingId.get(booking.id) ?? null)
            : null,
      }),
    );

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  private async loadEarningsByBookingId(bookingIds: string[]) {
    if (!bookingIds.length) {
      return new Map<string, number>();
    }

    const references = bookingIds.map((id) => `SVC-EARN-${id}`);
    const transactions = await this.prisma.transaction.findMany({
      where: { reference: { in: references } },
      select: { reference: true, amount: true },
    });

    return new Map(
      transactions.map((transaction) => [
        transaction.reference.replace('SVC-EARN-', ''),
        Number(transaction.amount),
      ]),
    );
  }
}