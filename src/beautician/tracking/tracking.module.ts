import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { HomeServiceSharedModule } from '../home-service-booking/home-service-shared.module';
import { ArrivalVerificationModule } from '../arrival-verification/arrival-verification.module';
import { LocationUpdateService } from './location-update.service';
import { LiveTrackingService } from './live-tracking.service';
import { LocationHistoryWriterService } from './location-history-writer.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    HomeServiceSharedModule,
    ArrivalVerificationModule,
    RealtimeModule,
  ],
  providers: [
    LocationUpdateService,
    LiveTrackingService,
    LocationHistoryWriterService,
  ],
  exports: [
    LocationUpdateService,
    LiveTrackingService,
    LocationHistoryWriterService,
  ],
})
export class TrackingModule {}