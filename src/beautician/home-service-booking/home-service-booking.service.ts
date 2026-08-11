import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus, BookingType } from '@prisma/client';
import { BookingServiceRecord } from '../../booking/utils/booking.utils';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingOrchestratorService } from '../matching/services/matching-orchestrator.service';
import { isDispatchWindowOpen } from '../matching/utils/dispatch-window.utils';
import { bookingNeedsBeauticianAssignment } from '../matching/utils/booking-assignment.utils';
import {
  MATCHING_SEARCHING_MESSAGE,
  resolveAssignmentStatusMessage,
  resolveExhaustedMessage,
} from '../matching/utils/matching-radius.util';
import { MatchingExhaustedReason } from '@prisma/client';

@Injectable()
export class HomeServiceBookingService {
  private readonly logger = new Logger(HomeServiceBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingOrchestrator: MatchingOrchestratorService,
  ) {}

  resolveInitialStatus(
    bookingType: BookingType,
    serviceRecords: BookingServiceRecord[],
  ): BookingStatus {
    return bookingNeedsBeauticianAssignment(bookingType, serviceRecords)
      ? BookingStatus.PENDING_ASSIGNMENT
      : BookingStatus.CONFIRMED;
  }

  /**
   * Schedule the first dispatch for a booking. For future-dated (scheduled)
   * bookings the create-offers job is delayed until `bookingDate -
   * DISPATCH_LEAD_TIME_MINUTES`; immediate bookings dispatch right away.
   */
  async triggerMatching(bookingId: string): Promise<void> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { bookingDate: true },
      });

      if (!booking) {
        this.logger.warn(
          `Cannot trigger matching — booking ${bookingId} not found`,
        );
        return;
      }

      await this.matchingOrchestrator.scheduleInitialDispatch(
        bookingId,
        booking.bookingDate,
      );
      this.logger.log(
        `Scheduled initial dispatch for booking ${bookingId} at ${booking.bookingDate.toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule matching for booking ${bookingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  getPaymentConfirmationMessage(
    status: BookingStatus,
    bookingDate?: Date | string | null,
    matchingExhaustedAt?: Date | string | null,
    matchingExhaustedReason?: MatchingExhaustedReason | null,
  ): string {
    if (status === BookingStatus.PENDING_ASSIGNMENT) {
      if (matchingExhaustedAt) {
        return `Payment successful. ${resolveExhaustedMessage(matchingExhaustedReason)}`;
      }

      if (bookingDate && !isDispatchWindowOpen(new Date(bookingDate))) {
        return 'Payment successful. We will match a beautician at your scheduled time.';
      }

      return `Payment successful. ${MATCHING_SEARCHING_MESSAGE}`;
    }

    return 'Payment successful. Booking confirmed.';
  }

  getAssignmentStatusMessage(booking: {
    status: BookingStatus;
    matchingExhaustedAt?: Date | string | null;
    matchingExhaustedReason?: MatchingExhaustedReason | null;
  }): string | null {
    return resolveAssignmentStatusMessage(booking);
  }
}
