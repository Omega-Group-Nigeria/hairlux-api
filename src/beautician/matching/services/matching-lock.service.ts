import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import {
  MATCHING_LOCK_TTL_SECONDS,
  matchingRedisKeys,
} from '../constants/matching-queue.constants';

/**
 * Distributed lock so only one matching flow runs per booking at a time.
 * Prevents concurrent continueMatching from queues, expire, wake, and retry.
 */
@Injectable()
export class MatchingLockService {
  private readonly logger = new Logger(MatchingLockService.name);

  constructor(private readonly redis: RedisService) {}

  async acquire(
    bookingId: string,
    owner = 'matching',
    ttlSeconds = MATCHING_LOCK_TTL_SECONDS,
  ): Promise<boolean> {
    const ok = await this.redis.setNx(
      matchingRedisKeys.flowLock(bookingId),
      owner,
      ttlSeconds,
    );
    if (!ok) {
      this.logger.log(
        `Matching lock busy for booking ${bookingId} — skipping concurrent run`,
      );
    }
    return ok;
  }

  async release(bookingId: string): Promise<void> {
    await this.redis.del(matchingRedisKeys.flowLock(bookingId));
  }

  async runExclusive<T>(
    bookingId: string,
    fn: () => Promise<T>,
    owner = 'matching',
  ): Promise<T | null> {
    const acquired = await this.acquire(bookingId, owner);
    if (!acquired) {
      return null;
    }
    try {
      return await fn();
    } finally {
      await this.release(bookingId);
    }
  }
}
