import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatBookingResponse } from '../../../booking/utils/booking.utils';
import { GeocodingService } from '../../../common/services/geocoding.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { haversineKm } from '../../matching/utils/geo.util';
import { ArrivalPinService } from '../../arrival-verification/services/arrival-pin.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { BookingParticipantService } from './booking-participant.service';
import { HomeServiceStatusService } from '../home-service-status.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';

@Injectable()
export class JobArrivedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participantService: BookingParticipantService,
    private readonly statusService: HomeServiceStatusService,
    private readonly pinService: ArrivalPinService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly geocodingService: GeocodingService,
    private readonly notificationService: BeauticianNotificationService,
    private readonly realtimePublisher: RealtimePublisherService,
  ) {}

  async markArrived(
    bookingId: string,
    beauticianUserId: string,
    coords: { lat: number; lng: number },
  ) {
    const booking =
      await this.participantService.getBookingForParticipant(bookingId);
    this.participantService.assertAssignedBeautician(
      booking,
      beauticianUserId,
    );

    if (booking.status === BookingStatus.ARRIVED) {
      const existingPin = await this.pinService.getPin(bookingId);
      return {
        booking: formatBookingResponse(booking),
        geoAuditFlag: existingPin?.geoAuditFlag ?? false,
        distanceMeters: existingPin?.distanceMeters ?? null,
        message: 'Already marked as arrived',
      };
    }

    this.statusService.assertTransition(booking.status, BookingStatus.ARRIVED);

    const destination = await this.resolveDestinationCoords(booking);
    const distanceMeters = destination
      ? Math.round(
          haversineKm(
            coords.lat,
            coords.lng,
            destination.lat,
            destination.lng,
          ) * 1000,
        )
      : null;

    const settings = await this.settingsService.getSettings();
    const geoAuditFlag =
      distanceMeters != null &&
      distanceMeters > settings.arrivalGeoFenceMeters;

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + settings.arrivalVerificationExpiryMinutes * 60_000,
    );
    const pin = this.pinService.generatePin();

    await this.pinService.storePin(
      bookingId,
      {
        pin,
        bookingId,
        beauticianUserId,
        expiresAt: expiresAt.toISOString(),
        geoAuditFlag,
        distanceMeters,
      },
      settings.arrivalVerificationExpiryMinutes * 60,
    );

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.ARRIVED,
        beauticianArrivalLat: coords.lat,
        beauticianArrivalLng: coords.lng,
      },
    });

    void this.notificationService.notifyArrivalVerificationNeeded(
      {
        email: booking.user.email,
        firstName: booking.user.firstName,
      },
      bookingId,
    );

    this.realtimePublisher.emitBookingStatus(bookingId, BookingStatus.ARRIVED);

    return {
      booking: formatBookingResponse(updated),
      geoAuditFlag,
      distanceMeters,
      geoFenceMeters: settings.arrivalGeoFenceMeters,
      verificationExpiresAt: expiresAt,
      message: geoAuditFlag
        ? 'Arrived recorded with geo audit flag. Share PIN with customer for verification.'
        : 'Arrived recorded. Share PIN with customer for verification.',
    };
  }

  private async resolveDestinationCoords(booking: {
    address: {
      fullAddress: string;
      latitude: unknown;
      longitude: unknown;
    } | null;
  }): Promise<{ lat: number; lng: number } | null> {
    if (!booking.address) {
      return null;
    }

    if (
      booking.address.latitude != null &&
      booking.address.longitude != null
    ) {
      return {
        lat: Number(booking.address.latitude),
        lng: Number(booking.address.longitude),
      };
    }

    const geocoded = await this.geocodingService.geocodeAddress(
      booking.address.fullAddress,
    );
    return geocoded
      ? { lat: geocoded.latitude, lng: geocoded.longitude }
      : null;
  }
}