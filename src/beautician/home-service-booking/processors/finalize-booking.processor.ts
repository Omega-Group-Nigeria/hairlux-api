import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { FinalizeBookingService } from '../services/finalize-booking.service';
import { HOME_SERVICE_LIFECYCLE_QUEUE } from '../home-service-lifecycle.constants';

interface FinalizeBookingJobData {
  bookingId: string;
}

@Processor(HOME_SERVICE_LIFECYCLE_QUEUE)
export class FinalizeBookingProcessor {
  private readonly logger = new Logger(FinalizeBookingProcessor.name);

  constructor(private readonly finalizeBookingService: FinalizeBookingService) {}

  @Process('finalize-booking')
  async handle(job: Job<FinalizeBookingJobData>) {
    this.logger.log(`Auto-finalizing booking ${job.data.bookingId}`);
    await this.finalizeBookingService.finalizeIfAwaitingConfirmation(
      job.data.bookingId,
    );
  }
}