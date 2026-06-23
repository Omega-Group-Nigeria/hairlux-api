import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  formatBookingResponse,
  normalizeBookingServices,
} from '../../../booking/utils/booking.utils';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { BookingParticipantService } from './booking-participant.service';
import { HomeServiceStatusService } from '../home-service-status.service';
import { CreditServiceEarningsService } from '../../payout/services/credit-service-earnings.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';

@Injectable()
export class CustomerCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participantService: BookingParticipantService,
    private readonly statusService: HomeServiceStatusService,
    private readonly notificationService: BeauticianNotificationService,
    private readonly creditEarningsService: CreditServiceEarningsService,
    private readonly realtimePublisher: RealtimePublisherService,
  ) {}

  async confirmCompletion(
    bookingId: string,
    customerUserId: string,
    input: { rating: number; review?: string },
  ) {
    if (input.rating < 1 || input.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const booking =
      await this.participantService.getBookingForParticipant(bookingId);
    this.participantService.assertCustomerAccess(booking, customerUserId);

    if (booking.status === BookingStatus.COMPLETED) {
      return {
        booking: formatBookingResponse(booking),
        message: 'Booking already completed',
      };
    }

    this.statusService.assertTransition(
      booking.status,
      BookingStatus.COMPLETED,
    );

    const services = normalizeBookingServices(booking.services);
    const primaryServiceId = services[0]?.serviceId;
    if (!primaryServiceId) {
      throw new BadRequestException('Booking has no services to review');
    }

    const now = new Date();
    const reviewComment = input.review?.trim() || null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const completedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.COMPLETED,
          customerRating: input.rating,
          customerReview: reviewComment,
        },
      });

      await tx.review.upsert({
        where: { bookingId },
        create: {
          userId: customerUserId,
          serviceId: primaryServiceId,
          bookingId,
          rating: input.rating,
          comment: reviewComment,
          status: ReviewStatus.APPROVED,
        },
        update: {
          rating: input.rating,
          comment: reviewComment,
          status: ReviewStatus.APPROVED,
        },
      });

      return completedBooking;
    });

    let earningsCredit: Awaited<
      ReturnType<CreditServiceEarningsService['creditForCompletedBooking']>
    > = null;

    if (booking.assignedBeauticianUserId) {
      earningsCredit = await this.creditEarningsService.creditForCompletedBooking(
        bookingId,
        input.rating,
      );

      await this.participantService.releaseBeauticianIfIdle(
        booking.assignedBeauticianUserId,
      );

      if (booking.assignedBeautician) {
        void this.notificationService.notifyServiceCompleted(
          {
            email: booking.assignedBeautician.email,
            firstName: booking.assignedBeautician.firstName,
          },
          bookingId,
          input.rating,
        );
      }
    }

    this.realtimePublisher.emitBookingStatus(bookingId, BookingStatus.COMPLETED, {
      customerRating: input.rating,
    });

    return {
      booking: formatBookingResponse(updated),
      completedAt: now,
      earningsCredit,
      message: 'Thank you for confirming service completion',
    };
  }
}