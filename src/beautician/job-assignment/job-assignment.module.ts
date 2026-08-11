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
import { JobEarningsResolverService } from './services/job-earnings-resolver.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PayoutModule } from '../payout/payout.module';
import { MatchingModule } from '../matching/matching.module';
import { BullModule } from '@nestjs/bull';
import { HOME_SERVICE_MATCHING_QUEUE } from '../home-service-booking/home-service-matching-queue.constants';
import { CommsModule } from '../../comms/comms.module';
import { BookingNotificationsModule } from '../../notifications/booking/booking-notifications.module';
import { JobNotificationsModule } from '../../notifications/job/job-notifications.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    HomeServiceLifecycleModule,
    RealtimeModule,
    MatchingModule,
    PayoutModule,
    BullModule.registerQueue({ name: HOME_SERVICE_MATCHING_QUEUE }),
    CommsModule,
    BookingNotificationsModule,
    JobNotificationsModule,
  ],
  controllers: [BeauticianJobsController],
  providers: [
    AssignmentLockService,
    JobAcceptService,
    JobDeclineService,
    JobQueryService,
    JobPresentationService,
    JobEarningsResolverService,
  ],
  exports: [JobAcceptService, JobQueryService],
})
export class JobAssignmentModule {}
