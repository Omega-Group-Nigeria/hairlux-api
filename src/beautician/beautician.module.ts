import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { BeauticianController } from './beautician.controller';
import { AdminBeauticianController } from './admin-beautician.controller';
import { AdminHomeServiceSettingsController } from './admin-home-service-settings.controller';
import { BeauticianReadService } from './services/beautician-read.service';
import { BeauticianProfileService } from './services/beautician-profile.service';
import { BeauticianAdminService } from './services/beautician-admin.service';
import { BeauticianServiceAssignmentService } from './services/beautician-service-assignment.service';
import { HomeServiceSettingsService } from './services/home-service-settings.service';
import { BeauticianAvailabilityService } from './services/beautician-availability.service';
import { NoShowPenaltyService } from './services/no-show-penalty.service';
import { BeauticianRoleGuard } from './guards/beautician-role.guard';
import { BeauticianWithdrawalGuard } from './guards/beautician-withdrawal.guard';
import { KycVerifiedGuard } from './guards/kyc-verified.guard';
import { FullyVerifiedGuard } from './guards/fully-verified.guard';
import { BeauticianPerformanceService } from './admin/services/beautician-performance.service';
import { AdminHomeServiceAnalyticsService } from './admin/services/admin-home-service-analytics.service';
import { ActiveHomeServiceBookingsService } from './admin/services/active-home-service-bookings.service';
import { KycModule } from './kyc/kyc.module';
import { BeauticianNotificationModule } from './notification/notification.module';
import { FcmModule } from './fcm/fcm.module';
import { HomeServiceBookingModule } from './home-service-booking/home-service-booking.module';
import { HomeServiceLifecycleModule } from './home-service-booking/home-service-lifecycle.module';
import { MatchingModule } from './matching/matching.module';
import { JobAssignmentModule } from './job-assignment/job-assignment.module';
import { TrackingModule } from './tracking/tracking.module';
import { PayoutModule } from './payout/payout.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    CloudinaryModule,
    FcmModule,
    BeauticianNotificationModule,
    KycModule,
    HomeServiceBookingModule,
    HomeServiceLifecycleModule,
    MatchingModule,
    JobAssignmentModule,
    TrackingModule,
    PayoutModule,
    RealtimeModule,
  ],
  controllers: [
    BeauticianController,
    AdminBeauticianController,
    AdminHomeServiceSettingsController,
  ],
  providers: [
    BeauticianReadService,
    BeauticianProfileService,
    BeauticianAdminService,
    BeauticianServiceAssignmentService,
    BeauticianAvailabilityService,
    HomeServiceSettingsService,
    NoShowPenaltyService,
    BeauticianPerformanceService,
    AdminHomeServiceAnalyticsService,
    ActiveHomeServiceBookingsService,
    BeauticianRoleGuard,
    BeauticianWithdrawalGuard,
    KycVerifiedGuard,
    FullyVerifiedGuard,
  ],
  exports: [
    BeauticianReadService,
    BeauticianProfileService,
    HomeServiceSettingsService,
    HomeServiceBookingModule,
    HomeServiceLifecycleModule,
    PayoutModule,
    BeauticianRoleGuard,
    BeauticianWithdrawalGuard,
    KycVerifiedGuard,
    FullyVerifiedGuard,
    AdminHomeServiceAnalyticsService,
    ActiveHomeServiceBookingsService,
    NoShowPenaltyService,
  ],
})
export class BeauticianModule {}