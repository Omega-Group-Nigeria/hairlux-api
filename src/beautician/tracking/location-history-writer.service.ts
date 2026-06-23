import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class LocationHistoryWriterService {
  private readonly sampleIntervalSeconds = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async recordSample(
    beauticianUserId: string,
    coords: { lat: number; lng: number; accuracy?: number | null },
    bookingId?: string | null,
  ) {
    const throttleKey = `beautician:loc-history:${beauticianUserId}`;
    const allowed = await this.redis.setNx(
      throttleKey,
      '1',
      this.sampleIntervalSeconds,
    );

    if (!allowed) {
      return false;
    }

    await this.prisma.beauticianLocationHistory.create({
      data: {
        beauticianUserId,
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy ?? null,
        bookingId: bookingId ?? null,
      },
    });

    return true;
  }
}