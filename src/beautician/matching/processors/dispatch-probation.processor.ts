import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import {
  DISPATCH_PROBATION_JOB,
  DISPATCH_PROBATION_QUEUE,
  type DispatchProbationJobData,
} from '../constants/dispatch-probation.constants';
import { DispatchAdminService } from '../services/dispatch-admin.service';

@Processor(DISPATCH_PROBATION_QUEUE)
export class DispatchProbationProcessor {
  private readonly logger = new Logger(DispatchProbationProcessor.name);

  constructor(private readonly dispatchAdmin: DispatchAdminService) {}

  @Process(DISPATCH_PROBATION_JOB)
  async handleLift(job: Job<DispatchProbationJobData>) {
    this.logger.log(
      `Processing dispatch probation lift job ${job.id} for profile ${job.data.profileId} until=${job.data.suspendedUntil}`,
    );

    const result = await this.dispatchAdmin.liftDispatchSuspensionFromJob(
      job.data,
    );

    this.logger.log(
      `Dispatch probation job ${job.id} result: ${JSON.stringify(result)}`,
    );

    return result;
  }
}
