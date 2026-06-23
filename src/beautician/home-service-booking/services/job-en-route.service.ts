import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatBookingResponse } from '../../../booking/utils/booking.utils';
import { BookingParticipantService } from './booking-participant.service';
import { HomeServiceStatusService } from '../home-service-status.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';

@Injectable()
export class JobEnRouteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participantService: BookingParticipantService,
    private readonly statusService: HomeServiceStatusService,
    private readonly realtimePublisher: RealtimePublisherService,
  ) {}

  async markEnRoute(bookingId: string, beauticianUserId: string) {
    const booking =
      await this.participantService.getBookingForParticipant(bookingId);
    this.participantService.assertAssignedBeautician(
      booking,
      beauticianUserId,
    );

    if (booking.status === BookingStatus.EN_ROUTE) {
      return { booking: formatBookingResponse(booking) };
    }

    this.statusService.assertTransition(booking.status, BookingStatus.EN_ROUTE);

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.EN_ROUTE },
    });

    this.realtimePublisher.emitBookingStatus(bookingId, BookingStatus.EN_ROUTE);

    return { booking: formatBookingResponse(updated) };
  }
}