import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatBookingResponse } from '../../../booking/utils/booking.utils';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { BookingParticipantService } from '../../home-service-booking/services/booking-participant.service';
import { HomeServiceStatusService } from '../../home-service-booking/home-service-status.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { ArrivalPinService } from './arrival-pin.service';
import { ArrivalQrTokenService } from './arrival-qr-token.service';
import { CommsRealtimeService } from '../../../comms/services/comms-realtime.service';

@Injectable()
export class VerifyArrivalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participantService: BookingParticipantService,
    private readonly pinService: ArrivalPinService,
    private readonly qrTokenService: ArrivalQrTokenService,
    private readonly statusService: HomeServiceStatusService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly notificationService: BeauticianNotificationService,
    private readonly commsRealtime: CommsRealtimeService,
  ) {}

  async verify(
    bookingId: string,
    customerUserId: string,
    input: { pin?: string; qrToken?: string },
  ) {
    if (!input.pin && !input.qrToken) {
      throw new BadRequestException('Provide either pin or qrToken');
    }

    const booking =
      await this.participantService.getBookingForParticipant(bookingId);
    this.participantService.assertCustomerAccess(booking, customerUserId);

    if (booking.status !== BookingStatus.ARRIVED) {
      throw new BadRequestException(
        'Arrival verification is not available for this booking',
      );
    }

    const submittedPin = await this.resolveSubmittedPin(bookingId, input);
    const pinRecord = await this.pinService.getPin(bookingId);

    if (!pinRecord) {
      throw new BadRequestException(
        'Arrival PIN has expired. Ask your beautician to regenerate it.',
      );
    }

    if (pinRecord.pin !== submittedPin) {
      throw new UnauthorizedException('Invalid arrival PIN');
    }

    await this.pinService.consumePin(bookingId);

    this.statusService.assertTransition(
      BookingStatus.ARRIVED,
      BookingStatus.ARRIVED_VERIFIED,
    );
    this.statusService.assertTransition(
      BookingStatus.ARRIVED_VERIFIED,
      BookingStatus.IN_PROGRESS,
    );

    const now = new Date();
    const settings = await this.settingsService.getSettings();
    const serviceEndsAt = this.statusService.calculateServiceEndsAt(
      now,
      booking.services,
      settings.serviceCompletionBufferMinutes,
    );

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.IN_PROGRESS,
        arrivalVerifiedAt: now,
        serviceStartedAt: now,
      },
    });

    if (booking.assignedBeautician) {
      void this.notificationService.notifyArrivalVerified(
        {
          email: booking.assignedBeautician.email,
          firstName: booking.assignedBeautician.firstName,
        },
        bookingId,
      );
    }

    await this.commsRealtime.emitBookingStatus(
      bookingId,
      BookingStatus.IN_PROGRESS,
      { serviceStartedAt: now.toISOString() },
    );

    return {
      booking: formatBookingResponse(updated),
      arrivalVerifiedAt: now,
      serviceStartedAt: now,
      serviceEndsAt,
      geoAuditFlag: pinRecord.geoAuditFlag,
    };
  }

  private async resolveSubmittedPin(
    bookingId: string,
    input: { pin?: string; qrToken?: string },
  ): Promise<string> {
    if (input.pin) {
      return input.pin.trim();
    }

    const decoded = this.qrTokenService.verify(String(input.qrToken));
    if (decoded.bookingId !== bookingId) {
      throw new UnauthorizedException('QR token does not match this booking');
    }

    return decoded.pin;
  }
}