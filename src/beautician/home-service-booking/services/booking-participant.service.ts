import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvailabilityStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import {
  BEAUTICIANS_ONLINE_GEO_KEY,
  beauticianMetaKey,
} from '../../matching/constants/location-index.constants';
import { ACTIVE_HOME_SERVICE_STATUSES } from '../home-service-status.service';

@Injectable()
export class BookingParticipantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getBookingForParticipant(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        address: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        assignedBeautician: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  assertCustomerAccess(booking: { userId: string }, userId: string): void {
    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }
  }

  assertAssignedBeautician(
    booking: { assignedBeauticianUserId: string | null },
    beauticianUserId: string,
  ): void {
    if (booking.assignedBeauticianUserId !== beauticianUserId) {
      throw new ForbiddenException(
        'You are not the assigned beautician for this booking',
      );
    }
  }

  assertLiveTrackingAccess(
    booking: { userId: string; assignedBeauticianUserId: string | null },
    userId: string,
    role: UserRole,
  ): void {
    const isCustomer = booking.userId === userId;
    const isAssignedBeautician =
      role === UserRole.BEAUTICIAN &&
      booking.assignedBeauticianUserId === userId;

    if (!isCustomer && !isAssignedBeautician) {
      throw new ForbiddenException('You do not have access to this booking');
    }
  }

  async releaseBeauticianIfIdle(beauticianUserId: string): Promise<void> {
    const activeCount = await this.prisma.booking.count({
      where: {
        assignedBeauticianUserId: beauticianUserId,
        status: { in: [...ACTIVE_HOME_SERVICE_STATUSES] },
      },
    });

    if (activeCount === 0) {
      const profile = await this.prisma.beauticianProfile.update({
        where: { userId: beauticianUserId },
        data: { availabilityStatus: AvailabilityStatus.ONLINE },
        select: {
          currentLat: true,
          currentLng: true,
          lastLocationUpdate: true,
          assignedServices: { select: { serviceId: true } },
        },
      });

      // Re-enter the geo index so the beautician is immediately visible to
      // new dispatch matching (otherwise ONLINE-but-invisible after a job).
      // Mirrors BeauticianLocationIndexService.upsertOnline without importing
      // the matching module (avoids a circular module dependency).
      if (profile.currentLat != null && profile.currentLng != null) {
        await this.redis.geoAdd(
          BEAUTICIANS_ONLINE_GEO_KEY,
          Number(profile.currentLng),
          Number(profile.currentLat),
          beauticianUserId,
        );
        await this.redis.hset(beauticianMetaKey(beauticianUserId), {
          lat: String(profile.currentLat),
          lng: String(profile.currentLng),
          services: profile.assignedServices.map((s) => s.serviceId).join(','),
          updatedAt: (profile.lastLocationUpdate ?? new Date()).toISOString(),
        });
      }
    }
  }
}
