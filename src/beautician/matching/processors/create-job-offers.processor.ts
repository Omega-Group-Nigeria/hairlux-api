import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { MatchingOrchestratorService } from '../services/matching-orchestrator.service';

interface CreateOffersJobData {
  bookingId: string;
}

@Processor('home-service-matching')
export class CreateJobOffersProcessor {
  private readonly logger = new Logger(CreateJobOffersProcessor.name);

  constructor(
    private readonly matchingOrchestrator: MatchingOrchestratorService,
  ) {}

  @Process('create-offers')
  async handle(job: Job<CreateOffersJobData>) {
    this.logger.log(`Processing create-offers for booking ${job.data.bookingId}`);
    await this.matchingOrchestrator.createOffersForBooking(job.data.bookingId);
  }
}