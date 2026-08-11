import { Injectable, Logger } from '@nestjs/common';
import {
  AvailabilityStatus,
  BookingStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { normalizeBookingServices } from '../../../booking/utils/booking.utils';
import { resolveBookingCoordinatesSync } from '../../../booking/utils/booking-location.utils';
import { extractHomeServiceIds } from '../utils/booking-assignment.utils';
import { haversineKm } from '../utils/geo.util';
import { beauticianLastRematchPosKey } from '../constants/location-index.constants';
import { getDispatchWindowOpenAt } from '../utils/dispatch-window.utils';
import { MatchingConfigService } from './matching-config.service';
import { MatchingOrchestratorService } from './matching-orchestrator.service';

@Injectable()
export class PendingBookingMatcherService {
  private readonly logger = new Logger(PendingBookingMatcherService.name);
  private readonly debounceSeconds = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly matchingConfig: MatchingConfigService,
    private readonly matchingOrchestrator: MatchingOrchestratorService,
  ) {}

  async onBeauticianAvailable(
    beauticianUserId: string,
    trigger: 'ONLINE' | 'LOCATION_UPDATE',
  ) {
    const debounceKey = `beautician:matching-trigger:${beauticianUserId}`;
    const allowed = await this.redis.setNx(
      debounceKey,
      trigger,
      this.debounceSeconds,
    );

    if (!allowed) {
      return;
    }

    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId: beauticianUserId },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });

    if (
      !profile?.isActive ||
      profile.dispatchSuspended ||
      profile.kycStatus !== KycStatus.VERIFIED ||
      profile.profileStatus !== ProfileReviewStatus.APPROVED ||
      profile.availabilityStatus !== AvailabilityStatus.ONLINE
    ) {
      return;
    }

    const lat = profile.currentLat ? Number(profile.currentLat) : null;
    const lng = profile.currentLng ? Number(profile.currentLng) : null;

    if (lat == null || lng == null) {
      return;
    }

    if (trigger === 'LOCATION_UPDATE') {
      const movedEnough = await this.hasMovedEnoughForRematch(
        beauticianUserId,
        lat,
        lng,
      );
      if (!movedEnough) {
        return;
      }
    }

    const assignedServiceIds = new Set(
      profile.assignedServices.map((item) => item.serviceId),
    );

    if (!assignedServiceIds.size) {
      return;
    }

    const maxRadiusKm = this.matchingConfig.getMaxRadiusKm();
    const includeExhausted =
      this.matchingConfig.isWakeExhaustedOnOnlineEnabled();

    const pendingBookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.PENDING_ASSIGNMENT,
        // Only wake bookings whose dispatch window has opened — scheduled
        // (future-dated) bookings must not be dispatched early.
        bookingDate: { lte: getDispatchWindowOpenAt() },
        OR: [
          { addressId: { not: null } },
          {
            AND: [
              { tempLatitude: { not: null } },
              { tempLongitude: { not: null } },
            ],
          },
        ],
        ...(includeExhausted ? {} : { matchingExhaustedAt: null }),
      },
      include: { address: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    let triggered = 0;

    for (const booking of pendingBookings) {
      const requiredServiceIds = extractHomeServiceIds(
        normalizeBookingServices(booking.services),
      );

      if (
        !requiredServiceIds.length ||
        !requiredServiceIds.every((serviceId) =>
          assignedServiceIds.has(serviceId),
        )
      ) {
        continue;
      }

      const customerCoords = resolveBookingCoordinatesSync(booking);
      if (!customerCoords) {
        continue;
      }

      const distanceKm = haversineKm(
        lat,
        lng,
        customerCoords.lat,
        customerCoords.lng,
      );

      if (distanceKm > maxRadiusKm) {
        continue;
      }

      const source = `beautician-${trigger.toLowerCase()}`;
      const queued = booking.matchingExhaustedAt
        ? await this.matchingOrchestrator.tryWakeExhaustedBooking(
            booking.id,
            source,
          )
        : await this.matchingOrchestrator.triggerImmediateMatching(
            booking.id,
            source,
          );

      if (queued) {
        triggered += 1;
      }
    }

    if (trigger === 'LOCATION_UPDATE' && triggered > 0) {
      await this.redis.set(
        beauticianLastRematchPosKey(beauticianUserId),
        { lat, lng },
        60 * 60,
      );
    }

    if (triggered > 0) {
      this.logger.log(
        `Triggered immediate matching for ${triggered} booking(s) after beautician ${beauticianUserId} ${trigger}`,
      );
    }
  }

  private async hasMovedEnoughForRematch(
    beauticianUserId: string,
    lat: number,
    lng: number,
  ): Promise<boolean> {
    const minDistanceM = this.matchingConfig.getLocationRematchMinDistanceM();
    const cacheKey = beauticianLastRematchPosKey(beauticianUserId);
    const previous = await this.redis.get<{ lat: number; lng: number }>(
      cacheKey,
    );

    if (!previous) {
      return true;
    }

    const movedKm = haversineKm(previous.lat, previous.lng, lat, lng);
    return movedKm * 1000 >= minDistanceM;
  }
}
