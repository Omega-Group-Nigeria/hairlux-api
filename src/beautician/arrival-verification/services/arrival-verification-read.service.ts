import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { BookingParticipantService } from '../../home-service-booking/services/booking-participant.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { ArrivalPinService } from './arrival-pin.service';
import { ArrivalQrTokenService } from './arrival-qr-token.service';

@Injectable()
export class ArrivalVerificationReadService {
  constructor(
    private readonly participantService: BookingParticipantService,
    private readonly pinService: ArrivalPinService,
    private readonly qrTokenService: ArrivalQrTokenService,
    private readonly settingsService: HomeServiceSettingsService,
  ) {}

  async getVerificationDisplay(bookingId: string, beauticianUserId: string) {
    const booking =
      await this.participantService.getBookingForParticipant(bookingId);
    this.participantService.assertAssignedBeautician(
      booking,
      beauticianUserId,
    );

    if (
      booking.status !== BookingStatus.ARRIVED &&
      booking.status !== BookingStatus.ARRIVED_VERIFIED
    ) {
      throw new BadRequestException(
        'Arrival verification is only available after marking arrived',
      );
    }

    const pinRecord = await this.pinService.getPin(bookingId);
    if (!pinRecord) {
      throw new BadRequestException(
        'Arrival verification has expired. Mark arrived again to generate a new PIN.',
      );
    }

    const settings = await this.settingsService.getSettings();
    const qrToken = this.qrTokenService.sign(
      bookingId,
      pinRecord.pin,
      settings.arrivalVerificationExpiryMinutes,
    );

    return {
      bookingId,
      status: booking.status,
      pin: pinRecord.pin,
      qrToken,
      expiresAt: pinRecord.expiresAt,
      geoAuditFlag: pinRecord.geoAuditFlag,
      distanceMeters: pinRecord.distanceMeters,
    };
  }
}