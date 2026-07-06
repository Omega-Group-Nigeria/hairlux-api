import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { BookingStatus, BookingType } from '@prisma/client';
import { BookingServiceRecord } from '../../booking/utils/booking.utils';
import { bookingNeedsBeauticianAssignment } from '../matching/utils/booking-assignment.utils';
import {
  MATCHING_SEARCHING_MESSAGE,
  resolveAssignmentStatusMessage,
  resolveExhaustedMessage,
} from '../matching/utils/matching-radius.util';
import { MatchingExhaustedReason } from '@prisma/client';

export const HOME_SERVICE_MATCHING_QUEUE = 'home-service-matching';

@Injectable()
export class HomeServiceBookingService {
  private readonly logger = new Logger(HomeServiceBookingService.name);

  constructor(
    @InjectQueue(HOME_SERVICE_MATCHING_QUEUE)
    private readonly matchingQueue: Queue,
  ) {}

  resolveInitialStatus(
    bookingType: BookingType,
    serviceRecords: BookingServiceRecord[],
  ): BookingStatus {
    return bookingNeedsBeauticianAssignment(bookingType, serviceRecords)
      ? BookingStatus.PENDING_ASSIGNMENT
      : BookingStatus.CONFIRMED;
  }

  async triggerMatching(bookingId: string): Promise<void> {
    try {
      await this.matchingQueue.add(
        'create-offers',
        { bookingId, matchingAttempt: 1 },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
        },
      );
      this.logger.log(`Queued home service matching for booking ${bookingId}`);
    } catch (error) {
      this.logger.error(
        `Failed to queue matching for booking ${bookingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  getPaymentConfirmationMessage(
    status: BookingStatus,
    matchingExhaustedAt?: Date | string | null,
    matchingExhaustedReason?: MatchingExhaustedReason | null,
  ): string {
    if (status === BookingStatus.PENDING_ASSIGNMENT) {
      if (matchingExhaustedAt) {
        return `Payment successful. ${resolveExhaustedMessage(matchingExhaustedReason)}`;
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