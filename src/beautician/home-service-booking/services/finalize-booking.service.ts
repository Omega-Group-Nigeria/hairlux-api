import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatBookingResponse } from '../../../booking/utils/booking.utils';
import { BookingParticipantService } from './booking-participant.service';
import { CreditServiceEarningsService } from '../../payout/services/credit-service-earnings.service';

@Injectable()
export class FinalizeBookingService {
  private readonly logger = new Logger(FinalizeBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly participantService: BookingParticipantService,
    private readonly creditEarningsService: CreditServiceEarningsService,
  ) {}

  async finalizeIfAwaitingConfirmation(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      this.logger.warn(`Finalize skipped: booking ${bookingId} not found`);
      return null;
    }

    if (booking.status !== BookingStatus.AWAITING_CUSTOMER_CONFIRM) {
      this.logger.log(
        `Finalize skipped for booking ${bookingId}: status is ${booking.status}`,
      );
      return null;
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.COMPLETED },
    });

    const earningsCredit =
      await this.creditEarningsService.creditForCompletedBooking(bookingId);

    if (booking.assignedBeauticianUserId) {
      await this.participantService.releaseBeauticianIfIdle(
        booking.assignedBeauticianUserId,
      );
    }

    this.logger.log(`Auto-finalized booking ${bookingId}`);
    return {
      booking: formatBookingResponse(updated),
      earningsCredit,
    };
  }
}