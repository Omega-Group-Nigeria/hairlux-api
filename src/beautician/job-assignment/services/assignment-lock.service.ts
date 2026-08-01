import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class AssignmentLockService {
  private readonly lockTtlSeconds = 30;

  constructor(private readonly redis: RedisService) {}

  async acquire(bookingId: string, ownerId: string): Promise<boolean> {
    return this.redis.setNx(
      this.lockKey(bookingId),
      ownerId,
      this.lockTtlSeconds,
    );
  }

  async release(bookingId: string): Promise<void> {
    await this.redis.del(this.lockKey(bookingId));
  }

  private lockKey(bookingId: string): string {
    return `booking:assign:${bookingId}`;
  }
}