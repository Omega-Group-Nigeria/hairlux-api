import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { MailModule } from '../../mail/mail.module';
import { BeauticianNotificationModule } from '../notification/notification.module';
import { HOME_SERVICE_MATCHING_QUEUE } from '../home-service-booking/home-service-matching-queue.constants';
import { DISPATCH_PROBATION_QUEUE } from './constants/dispatch-probation.constants';
import { HomeServiceSettingsService } from '../services/home-service-settings.service';
import { CandidateFinderService } from './services/candidate-finder.service';
import { CandidateEligibilityService } from './services/candidate-eligibility.service';
import { CandidateMetricsService } from './services/candidate-metrics.service';
import { CandidateScorerService } from './services/candidate-scorer.service';
import { CandidatePoolAnalyzerService } from './services/candidate-pool-analyzer.service';
import { MatchingExhaustionResolverService } from './services/matching-exhaustion-resolver.service';
import { OfferExclusionService } from './services/offer-exclusion.service';
import { OfferManagerService } from './services/offer-manager.service';
import { MatchingConfigService } from './services/matching-config.service';
import { DispatchConfigStoreService } from './services/dispatch-config-store.service';
import { DispatchConfigResolverService } from './services/dispatch-config-resolver.service';
import { DispatchConfigAdminService } from './services/dispatch-config-admin.service';
import { MatchingOrchestratorService } from './services/matching-orchestrator.service';
import { MatchingLockService } from './services/matching-lock.service';
import { MatchingQueueService } from './services/matching-queue.service';
import { BookingCoordinatesService } from './services/booking-coordinates.service';
import { OfferLifecycleService } from './services/offer-lifecycle.service';
import { MatchingAttemptService } from './services/matching-attempt.service';
import { DispatchStateService } from './services/dispatch-state.service';
import { DispatchTraceService } from './services/dispatch-trace.service';
import { AdminDispatchSettingsController } from './admin-dispatch-settings.controller';
import { PendingBookingMatcherService } from './services/pending-booking-matcher.service';
import { BeauticianLocationIndexService } from './services/beautician-location-index.service';
import { DispatchAdminService } from './services/dispatch-admin.service';
import { CreateJobOffersProcessor } from './processors/create-job-offers.processor';
import { ExpireJobOfferProcessor } from './processors/expire-job-offer.processor';
import { DispatchProbationProcessor } from './processors/dispatch-probation.processor';
import { RealtimeModule } from '../realtime/realtime.module';
import { CommsModule } from '../../comms/comms.module';
import { PayoutModule } from '../payout/payout.module';
import { HomeServiceSharedModule } from '../home-service-booking/home-service-shared.module';
import { JobNotificationsModule } from '../../notifications/job/job-notifications.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    MailModule,
    BeauticianNotificationModule,
    RealtimeModule,
    BullModule.registerQueue({ name: HOME_SERVICE_MATCHING_QUEUE }),
    BullModule.registerQueue({ name: DISPATCH_PROBATION_QUEUE }),
    CommsModule,
    PayoutModule,
    forwardRef(() => HomeServiceSharedModule),
    JobNotificationsModule,
  ],
  controllers: [AdminDispatchSettingsController],
  providers: [
    HomeServiceSettingsService,
    DispatchConfigStoreService,
    DispatchConfigResolverService,
    DispatchConfigAdminService,
    MatchingConfigService,
    CandidateEligibilityService,
    CandidateMetricsService,
    CandidateScorerService,
    CandidatePoolAnalyzerService,
    MatchingExhaustionResolverService,
    OfferExclusionService,
    BeauticianLocationIndexService,
    CandidateFinderService,
    MatchingLockService,
    MatchingQueueService,
    BookingCoordinatesService,
    OfferLifecycleService,
    MatchingAttemptService,
    OfferManagerService,
    DispatchStateService,
    DispatchTraceService,
    MatchingOrchestratorService,
    PendingBookingMatcherService,
    CreateJobOffersProcessor,
    ExpireJobOfferProcessor,
    DispatchProbationProcessor,
    DispatchAdminService,
  ],
  exports: [
    MatchingOrchestratorService,
    OfferManagerService,
    OfferLifecycleService,
    PendingBookingMatcherService,
    MatchingConfigService,
    DispatchConfigAdminService,
    DispatchStateService,
    DispatchTraceService,
    BeauticianLocationIndexService,
    DispatchAdminService,
  ],
})
export class MatchingModule {}
