import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { JobOptions, Queue } from 'bull';
import { HOME_SERVICE_MATCHING_QUEUE } from '../../home-service-booking/home-service-matching-queue.constants';
import { RedisService } from '../../../redis/redis.service';
import {
  MATCHING_JOB_INDEX_TTL_SECONDS,
  MATCHING_JOB_NAMES,
  matchingJobIds,
  matchingRedisKeys,
} from '../constants/matching-queue.constants';

type CreateOffersPayload = {
  bookingId: string;
  matchingAttempt: number;
};

/**
 * Owns Bull job scheduling/removal for matching.
 * Tracks job IDs per booking in Redis so cancellation never scans the queue.
 */
@Injectable()
export class MatchingQueueService {
  private readonly logger = new Logger(MatchingQueueService.name);

  constructor(
    @InjectQueue(HOME_SERVICE_MATCHING_QUEUE)
    private readonly matchingQueue: Queue,
    private readonly redis: RedisService,
  ) {}

  async scheduleCreateOffers(
    payload: CreateOffersPayload,
    options: {
      delayMs?: number;
      jobId: string;
    },
  ): Promise<void> {
    const opts: JobOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      jobId: options.jobId,
      ...(options.delayMs != null ? { delay: options.delayMs } : {}),
    };

    // Replace any existing job with the same deterministic id.
    await this.removeJobById(options.jobId);

    await this.matchingQueue.add(
      MATCHING_JOB_NAMES.CREATE_OFFERS,
      payload,
      opts,
    );
    await this.trackJob(payload.bookingId, options.jobId);
  }

  async scheduleExpireOffer(params: {
    offerId: string;
    bookingId: string;
    matchingAttempt: number;
    delayMs: number;
  }): Promise<void> {
    const jobId = matchingJobIds.expireOffer(params.offerId);
    await this.removeJobById(jobId);
    await this.matchingQueue.add(
      MATCHING_JOB_NAMES.EXPIRE_OFFER,
      {
        offerId: params.offerId,
        bookingId: params.bookingId,
        matchingAttempt: params.matchingAttempt,
      },
      {
        delay: params.delayMs,
        jobId,
        removeOnComplete: true,
        removeOnFail: { age: 24 * 3600, count: 5000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    await this.trackJob(params.bookingId, jobId);
  }

  async removeExpireOfferJob(offerId: string): Promise<void> {
    await this.removeJobById(matchingJobIds.expireOffer(offerId));
  }

  /**
   * Cancel all tracked matching jobs for a booking (create-offers / expire-offer).
   * Uses Redis index + getJob(jobId) — never getJobs() full queue scan.
   */
  async cancelBookingJobs(bookingId: string): Promise<void> {
    const indexKey = matchingRedisKeys.jobIndex(bookingId);
    const jobIds = await this.listTrackedJobs(indexKey);

    await Promise.all(jobIds.map((jobId) => this.removeJobById(jobId)));
    await this.redis.del(indexKey);
  }

  private async trackJob(bookingId: string, jobId: string): Promise<void> {
    const indexKey = matchingRedisKeys.jobIndex(bookingId);
    try {
      await this.redis.client.sadd(indexKey, jobId);
      await this.redis.client.expire(indexKey, MATCHING_JOB_INDEX_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(
        `Failed to track matching job ${jobId}: ${(err as Error).message}`,
      );
    }
  }

  private async listTrackedJobs(indexKey: string): Promise<string[]> {
    try {
      return await this.redis.client.smembers(indexKey);
    } catch (err) {
      this.logger.warn(
        `Failed to list matching jobs for ${indexKey}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  private async removeJobById(jobId: string): Promise<void> {
    try {
      const job = await this.matchingQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    } catch (err) {
      this.logger.warn(
        `Failed to remove matching job ${jobId}: ${(err as Error).message}`,
      );
    }
  }
}
