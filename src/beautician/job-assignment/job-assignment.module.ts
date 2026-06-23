import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { HomeServiceLifecycleModule } from '../home-service-booking/home-service-lifecycle.module';
import { BeauticianJobsController } from './beautician-jobs.controller';
import { AssignmentLockService } from './services/assignment-lock.service';
import { JobAcceptService } from './services/job-accept.service';
import { JobDeclineService } from './services/job-decline.service';
import { JobQueryService } from './services/job-query.service';
import { JobPresentationService } from './services/job-presentation.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PrismaModule, RedisModule, HomeServiceLifecycleModule, RealtimeModule],
  controllers: [BeauticianJobsController],
  providers: [
    AssignmentLockService,
    JobAcceptService,
    JobDeclineService,
    JobQueryService,
    JobPresentationService,
  ],
  exports: [JobAcceptService, JobQueryService],
})
export class JobAssignmentModule {}