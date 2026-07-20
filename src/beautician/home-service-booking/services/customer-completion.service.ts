import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BookingCommsCloseReason,
  BookingStatus,
  Prisma,
  ReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  formatBookingResponse,
  normalizeBookingServices,
} from '../../../booking/utils/booking.utils';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { BookingParticipantService } from './booking-participant.service';
import { HomeServiceStatusService } from '../home-service-status.service';
import { CreditServiceEarningsService } from '../../payout/services/credit-service-earnings.service';
import { BookingPushNotifier } from '../../../notifications/booking/booking-push.notifier';
import { JobPushNotifier } from '../../../notifications/job/job-push.notifier';
import { CommsRealtimeService } from '../../../comms/services/comms-realtime.service';
import { CommsSessionService } from '../../../comms/services/comms-session.service';

type ConfirmCompletionInput = { rating: number; review?: string };

@Injectable()
export class CustomerCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participantService: BookingParticipantService,
    private readonly statusService: HomeServiceStatusService,
    private readonly notificationService: BeauticianNotificationService,
    private readonly creditEarningsService: CreditServiceEarningsService,
    private readonly commsRealtime: CommsRealtimeService,
    private readonly commsSessionService: CommsSessionService,
    private readonly bookingPushNotifier: BookingPushNotifier,
    private readonly jobPushNotifier: JobPushNotifier,
  ) {}

  async confirmCompletion(
    bookingId: string,
    customerUserId: string,
    input: ConfirmCompletionInput,
  ) {
    if (input.rating < 1 || input.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const booking =
      await this.participantService.getBookingForParticipant(bookingId);
    this.participantService.assertCustomerAccess(booking, customerUserId);

    if (booking.status === BookingStatus.COMPLETED) {
      if (booking.customerRating != null) {
        return {
          booking: formatBookingResponse(booking),
          message: 'Booking already completed',
        };
      }

      return this.applyLateRating(bookingId, booking, customerUserId, input);
    }

    this.statusService.assertTransition(
      booking.status,
      BookingStatus.COMPLETED,
    );

    const primaryServiceId = this.resolvePrimaryServiceId(booking.services);
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

      await this.persistReview(tx, {
        bookingId,
        customerUserId,
        primaryServiceId,
        rating: input.rating,
        comment: reviewComment,
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

      this.jobPushNotifier.notifyCompleted({
        beauticianUserId: booking.assignedBeauticianUserId,
        bookingId,
        rating: input.rating,
      });
    }

    await this.commsRealtime.emitBookingStatus(
      bookingId,
      BookingStatus.COMPLETED,
      {
        customerRating: input.rating,
      },
    );

    this.bookingPushNotifier.notifyCompleted({
      customerUserId: customerUserId,
      bookingId,
    });

    void this.commsSessionService.closeForBookingSafely(
      bookingId,
      BookingCommsCloseReason.CUSTOMER_CONFIRMED,
    );

    return {
      booking: formatBookingResponse(updated),
      completedAt: now,
      earningsCredit,
      message: 'Thank you for confirming service completion',
    };
  }

  private async applyLateRating(
    bookingId: string,
    booking: Awaited<
      ReturnType<BookingParticipantService['getBookingForParticipant']>
    >,
    customerUserId: string,
    input: ConfirmCompletionInput,
  ) {
    const primaryServiceId = this.resolvePrimaryServiceId(booking.services);
    const reviewComment = input.review?.trim() || null;
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const ratedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          customerRating: input.rating,
          customerReview: reviewComment,
        },
      });

      await this.persistReview(tx, {
        bookingId,
        customerUserId,
        primaryServiceId,
        rating: input.rating,
        comment: reviewComment,
      });

      return ratedBooking;
    });

    if (booking.assignedBeauticianUserId) {
      await this.creditEarningsService.refreshBeauticianRatingAfterReview(
        bookingId,
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

    await this.commsRealtime.emitBookingStatus(
      bookingId,
      BookingStatus.COMPLETED,
      {
        customerRating: input.rating,
      },
    );

    return {
      booking: formatBookingResponse(updated),
      completedAt: now,
      earningsCredit: null,
      message: 'Thank you for your rating',
    };
  }

  private resolvePrimaryServiceId(services: unknown): string {
    const normalized = normalizeBookingServices(services);
    const primaryServiceId = normalized[0]?.serviceId;

    if (!primaryServiceId) {
      throw new BadRequestException('Booking has no services to review');
    }

    return primaryServiceId;
  }

  private async persistReview(
    tx: Prisma.TransactionClient,
    params: {
      bookingId: string;
      customerUserId: string;
      primaryServiceId: string;
      rating: number;
      comment: string | null;
    },
  ): Promise<void> {
    const reviewData = {
      rating: params.rating,
      comment: params.comment,
      status: ReviewStatus.APPROVED,
    };

    await tx.review.upsert({
      where: { bookingId: params.bookingId },
      create: {
        userId: params.customerUserId,
        serviceId: params.primaryServiceId,
        bookingId: params.bookingId,
        ...reviewData,
      },
      update: reviewData,
    });
  }
}