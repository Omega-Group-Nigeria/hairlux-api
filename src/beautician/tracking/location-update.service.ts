import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { UpdateLocationDto } from '../dto/update-location.dto';
import { BEAUTICIAN_LIVE_LOCATION_KEY_PREFIX } from '../home-service-booking/home-service-lifecycle.constants';
import { LocationHistoryWriterService } from './location-history-writer.service';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';
import { ACTIVE_HOME_SERVICE_STATUSES } from '../home-service-booking/home-service-status.service';

@Injectable()
export class LocationUpdateService {
  private readonly rateLimitSeconds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly locationHistoryWriter: LocationHistoryWriterService,
    private readonly realtimePublisher: RealtimePublisherService,
  ) {}

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    const rateLimitKey = `beautician:location:${userId}`;
    const allowed = await this.redis.setNx(
      rateLimitKey,
      '1',
      this.rateLimitSeconds,
    );

    if (!allowed) {
      throw new HttpException(
        'Location updates are rate limited. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const now = new Date();
    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: {
        currentLat: dto.lat,
        currentLng: dto.lng,
        lastLocationUpdate: now,
      },
      select: {
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
      },
    });

    await this.redis.set(
      `${BEAUTICIAN_LIVE_LOCATION_KEY_PREFIX}${userId}`,
      {
        lat: dto.lat,
        lng: dto.lng,
        accuracy: dto.accuracy ?? null,
        updatedAt: now.toISOString(),
      },
      60 * 60,
    );

    void this.locationHistoryWriter.recordSample(
      userId,
      { lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy },
      dto.bookingId,
    );

    const bookingId =
      dto.bookingId ?? (await this.resolveActiveBookingId(userId));
    if (bookingId) {
      this.realtimePublisher.emitBookingLocation(bookingId, {
        lat: dto.lat,
        lng: dto.lng,
        accuracy: dto.accuracy ?? null,
        updatedAt: now.toISOString(),
      });
    }

    return {
      lat: Number(updated.currentLat),
      lng: Number(updated.currentLng),
      lastLocationUpdate: updated.lastLocationUpdate,
      accuracy: dto.accuracy ?? null,
    };
  }

  private async resolveActiveBookingId(beauticianUserId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        assignedBeauticianUserId: beauticianUserId,
        status: { in: [...ACTIVE_HOME_SERVICE_STATUSES] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    return booking?.id ?? null;
  }
}