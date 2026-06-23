import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { MatchingOrchestratorService } from '../services/matching-orchestrator.service';

interface ExpireOffersJobData {
  bookingId: string;
}

@Processor('home-service-matching')
export class ExpireJobOfferProcessor {
  private readonly logger = new Logger(ExpireJobOfferProcessor.name);

  constructor(
    private readonly matchingOrchestrator: MatchingOrchestratorService,
  ) {}

  @Process('expire-offers')
  async handle(job: Job<ExpireOffersJobData>) {
    this.logger.log(`Expiring offers for booking ${job.data.bookingId}`);
    await this.matchingOrchestrator.expireOffersForBooking(job.data.bookingId);
  }
}