import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { RedisService } from '../../../redis/redis.service';

export interface ArrivalPinRecord {
  pin: string;
  bookingId: string;
  beauticianUserId: string;
  expiresAt: string;
  geoAuditFlag: boolean;
  distanceMeters: number | null;
}

@Injectable()
export class ArrivalPinService {
  constructor(private readonly redis: RedisService) {}

  private redisKey(bookingId: string): string {
    return `booking:arrival-pin:${bookingId}`;
  }

  generatePin(): string {
    return String(randomInt(100_000, 1_000_000));
  }

  async storePin(
    bookingId: string,
    record: ArrivalPinRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(this.redisKey(bookingId), record, ttlSeconds);
  }

  async getPin(bookingId: string): Promise<ArrivalPinRecord | null> {
    return this.redis.get<ArrivalPinRecord>(this.redisKey(bookingId));
  }

  async consumePin(bookingId: string): Promise<ArrivalPinRecord | null> {
    const record = await this.getPin(bookingId);
    if (!record) {
      return null;
    }

    await this.redis.del(this.redisKey(bookingId));
    return record;
  }
}