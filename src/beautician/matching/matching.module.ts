import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../prisma/prisma.module';
import { BeauticianNotificationModule } from '../notification/notification.module';
import { HOME_SERVICE_MATCHING_QUEUE } from '../home-service-booking/home-service-booking.service';
import { HomeServiceSettingsService } from '../services/home-service-settings.service';
import { CandidateFinderService } from './services/candidate-finder.service';
import { OfferFactoryService } from './services/offer-factory.service';
import { MatchingOrchestratorService } from './services/matching-orchestrator.service';
import { CreateJobOffersProcessor } from './processors/create-job-offers.processor';
import { ExpireJobOfferProcessor } from './processors/expire-job-offer.processor';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    PrismaModule,
    BeauticianNotificationModule,
    RealtimeModule,
    BullModule.registerQueue({ name: HOME_SERVICE_MATCHING_QUEUE }),
  ],
  providers: [
    HomeServiceSettingsService,
    CandidateFinderService,
    OfferFactoryService,
    MatchingOrchestratorService,
    CreateJobOffersProcessor,
    ExpireJobOfferProcessor,
  ],
  exports: [MatchingOrchestratorService],
})
export class MatchingModule {}