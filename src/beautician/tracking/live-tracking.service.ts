import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, UserRole } from '@prisma/client';
import { RedisService } from '../../redis/redis.service';
import { BookingParticipantService } from '../home-service-booking/services/booking-participant.service';
import { HomeServiceStatusService } from '../home-service-booking/home-service-status.service';
import { HomeServiceSettingsService } from '../services/home-service-settings.service';
import { ArrivalPinService } from '../arrival-verification/services/arrival-pin.service';
import { BEAUTICIAN_LIVE_LOCATION_KEY_PREFIX } from '../home-service-booking/home-service-lifecycle.constants';
import {
  REALTIME_NAMESPACE,
  realtimeRoom,
} from '../realtime/realtime.constants';

interface LiveLocationRecord {
  lat: number;
  lng: number;
  accuracy: number | null;
  updatedAt: string;
}

const TRACKABLE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ASSIGNED,
  BookingStatus.EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.ARRIVED_VERIFIED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.AWAITING_CUSTOMER_CONFIRM,
];

@Injectable()
export class LiveTrackingService {
  constructor(
    private readonly participantService: BookingParticipantService,
    private readonly statusService: HomeServiceStatusService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly pinService: ArrivalPinService,
    private readonly redis: RedisService,
  ) {}

  async getLiveTracking(
    bookingId: string,
    userId: string,
    role: UserRole,
  ) {
    const booking =
      await this.participantService.getBookingForParticipant(bookingId);
    this.participantService.assertLiveTrackingAccess(booking, userId, role);

    if (!TRACKABLE_STATUSES.includes(booking.status)) {
      throw new BadRequestException(
        'Live tracking is not available for this booking status',
      );
    }

    if (!booking.assignedBeauticianUserId) {
      throw new BadRequestException('No beautician assigned to this booking');
    }

    const location = await this.redis.get<LiveLocationRecord>(
      `${BEAUTICIAN_LIVE_LOCATION_KEY_PREFIX}${booking.assignedBeauticianUserId}`,
    );

    const pinRecord = await this.pinService.getPin(bookingId);
    const settings = await this.settingsService.getSettings();

    let serviceEndsAt: Date | null = null;
    if (booking.serviceStartedAt) {
      serviceEndsAt = this.statusService.calculateServiceEndsAt(
        booking.serviceStartedAt,
        booking.services,
        settings.serviceCompletionBufferMinutes,
      );
    }

    return {
      bookingId,
      status: booking.status,
      realtime: {
        channel: REALTIME_NAMESPACE,
        room: realtimeRoom.booking(bookingId),
        fallbackPollIntervalSeconds: 10,
      },
      beautician: booking.assignedBeautician
        ? {
            id: booking.assignedBeautician.id,
            firstName: booking.assignedBeautician.firstName,
            lastName: booking.assignedBeautician.lastName,
            phone: booking.assignedBeautician.phone,
          }
        : null,
      location: location
        ? {
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
            updatedAt: location.updatedAt,
          }
        : null,
      serviceStartedAt: booking.serviceStartedAt,
      serviceEndsAt,
      geoAuditFlag: pinRecord?.geoAuditFlag ?? false,
    };
  }
}