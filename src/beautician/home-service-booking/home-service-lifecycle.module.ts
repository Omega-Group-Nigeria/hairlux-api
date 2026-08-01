import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';
import { BeauticianNotificationModule } from '../notification/notification.module';
import { ArrivalVerificationModule } from '../arrival-verification/arrival-verification.module';
import { HomeServiceSharedModule } from './home-service-shared.module';
import { HOME_SERVICE_LIFECYCLE_QUEUE } from './home-service-lifecycle.constants';
import { JobEnRouteService } from './services/job-en-route.service';
import { JobArrivedService } from './services/job-arrived.service';
import { ServiceCompletionService } from './services/service-completion.service';
import { CustomerCompletionService } from './services/customer-completion.service';
import { FinalizeBookingService } from './services/finalize-booking.service';
import { FinalizeBookingProcessor } from './processors/finalize-booking.processor';
import { PayoutModule } from '../payout/payout.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CommsModule } from '../../comms/comms.module';
import { BookingNotificationsModule } from '../../notifications/booking/booking-notifications.module';
import { JobNotificationsModule } from '../../notifications/job/job-notifications.module';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    BeauticianNotificationModule,
    HomeServiceSharedModule,
    ArrivalVerificationModule,
    PayoutModule,
    RealtimeModule,
    BullModule.registerQueue({ name: HOME_SERVICE_LIFECYCLE_QUEUE }),
    CommsModule,
    BookingNotificationsModule,
    JobNotificationsModule,
  ],
  providers: [
    JobEnRouteService,
    JobArrivedService,
    ServiceCompletionService,
    CustomerCompletionService,
    FinalizeBookingService,
    FinalizeBookingProcessor,
  ],
  exports: [
    HomeServiceSharedModule,
    ArrivalVerificationModule,
    JobEnRouteService,
    JobArrivedService,
    ServiceCompletionService,
    CustomerCompletionService,
  ],
})
export class HomeServiceLifecycleModule {}