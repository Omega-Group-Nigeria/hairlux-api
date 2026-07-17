import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatBookingResponse } from '../../../booking/utils/booking.utils';
import { resolveBookingCoordinatesSync } from '../../../booking/utils/booking-location.utils';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { haversineKm } from '../../matching/utils/geo.util';
import { ArrivalPinService } from '../../arrival-verification/services/arrival-pin.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { BookingParticipantService } from './booking-participant.service';
import { HomeServiceStatusService } from '../home-service-status.service';
import { CommsRealtimeService } from '../../../comms/services/comms-realtime.service';

@Injectable()
export class JobArrivedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participantService: BookingParticipantService,
    private readonly statusService: HomeServiceStatusService,
    private readonly pinService: ArrivalPinService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly notificationService: BeauticianNotificationService,
    private readonly commsRealtime: CommsRealtimeService,
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

    // Destination resolve is sync (stored lat/lng only); settings may hit cache.
    const [destination, settings] = await Promise.all([
      Promise.resolve(this.resolveDestinationCoords(booking)),
      this.settingsService.getSettings(),
    ]);

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

    const geoAuditFlag =
      distanceMeters != null &&
      distanceMeters > settings.arrivalGeoFenceMeters;

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + settings.arrivalVerificationExpiryMinutes * 60_000,
    );
    const pin = this.pinService.generatePin();

    // Integrity order: PIN available before status is ARRIVED for customers.
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

    // Side effects: do not block the HTTP response.
    void this.notificationService.notifyArrivalVerificationNeeded(
      {
        email: booking.user.email,
        firstName: booking.user.firstName,
      },
      bookingId,
    );
    void this.commsRealtime.emitBookingStatus(
      bookingId,
      BookingStatus.ARRIVED,
    );

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

  /**
   * Hot path: only use coordinates already on the booking (saved address or
   * temporary location). No external geocoding — missing coords yield null
   * distance (no geo audit).
   */
  private resolveDestinationCoords(booking: {
    address: {
      fullAddress: string;
      latitude: unknown;
      longitude: unknown;
    } | null;
    tempLatitude?: unknown;
    tempLongitude?: unknown;
    tempFullAddress?: string | null;
  }): { lat: number; lng: number } | null {
    return resolveBookingCoordinatesSync(booking);
  }
}
