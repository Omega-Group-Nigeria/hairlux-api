import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { MatchingOrchestratorService } from '../services/matching-orchestrator.service';

interface ExpireOfferJobData {
  offerId: string;
  bookingId: string;
  matchingAttempt?: number;
}

interface ExpireOffersJobData {
  bookingId: string;
  matchingAttempt?: number;
}

@Processor('home-service-matching')
export class ExpireJobOfferProcessor {
  private readonly logger = new Logger(ExpireJobOfferProcessor.name);

  constructor(
    private readonly matchingOrchestrator: MatchingOrchestratorService,
  ) {}

  @Process('expire-offer')
  async handleSingleOffer(job: Job<ExpireOfferJobData>) {
    this.logger.log(
      `Expiring offer ${job.data.offerId} for booking ${job.data.bookingId}`,
    );
    await this.matchingOrchestrator.expireOffer(
      job.data.offerId,
      job.data.bookingId,
      job.data.matchingAttempt ?? 1,
    );
  }

  /** Drains pre-Phase-1 `expire-offers` jobs still in the queue. */
  @Process('expire-offers')
  async handleStaleBatchExpiry(job: Job<ExpireOffersJobData>) {
    this.logger.log(`Expiring offers for booking ${job.data.bookingId}`);
    await this.matchingOrchestrator.expireOffersForBooking(
      job.data.bookingId,
      job.data.matchingAttempt ?? 1,
    );
  }
}