import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatBookingResponse } from '../../../booking/utils/booking.utils';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { BookingParticipantService } from './booking-participant.service';
import { HomeServiceStatusService } from '../home-service-status.service';
import {
  FINALIZE_BOOKING_DELAY_MS,
  HOME_SERVICE_LIFECYCLE_QUEUE,
} from '../home-service-lifecycle.constants';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';

@Injectable()
export class ServiceCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participantService: BookingParticipantService,
    private readonly statusService: HomeServiceStatusService,
    private readonly notificationService: BeauticianNotificationService,
    private readonly realtimePublisher: RealtimePublisherService,
    @InjectQueue(HOME_SERVICE_LIFECYCLE_QUEUE)
    private readonly lifecycleQueue: Queue,
  ) {}

  async completeService(
    bookingId: string,
    beauticianUserId: string,
    notes?: string,
  ) {
    const booking =
      await this.participantService.getBookingForParticipant(bookingId);
    this.participantService.assertAssignedBeautician(
      booking,
      beauticianUserId,
    );

    if (booking.status === BookingStatus.AWAITING_CUSTOMER_CONFIRM) {
      return {
        booking: formatBookingResponse(booking),
        message: 'Service already marked complete',
      };
    }

    this.statusService.assertTransition(
      booking.status,
      BookingStatus.AWAITING_CUSTOMER_CONFIRM,
    );

    const now = new Date();
    const completionNote = notes?.trim();
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.AWAITING_CUSTOMER_CONFIRM,
        serviceCompletedAt: now,
        ...(completionNote
          ? {
              notes: booking.notes
                ? `${booking.notes} | Service notes: ${completionNote}`
                : `Service notes: ${completionNote}`,
            }
          : {}),
      },
    });

    await this.lifecycleQueue.add(
      'finalize-booking',
      { bookingId },
      {
        delay: FINALIZE_BOOKING_DELAY_MS,
        jobId: `finalize-${bookingId}`,
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    void this.notificationService.notifyServiceAwaitingConfirmation(
      {
        email: booking.user.email,
        firstName: booking.user.firstName,
      },
      bookingId,
    );

    this.realtimePublisher.emitBookingStatus(
      bookingId,
      BookingStatus.AWAITING_CUSTOMER_CONFIRM,
    );

    return {
      booking: formatBookingResponse(updated),
      serviceCompletedAt: now,
      autoFinalizeAt: new Date(now.getTime() + FINALIZE_BOOKING_DELAY_MS),
      message:
        'Service marked complete. Customer confirmation requested.',
    };
  }
}