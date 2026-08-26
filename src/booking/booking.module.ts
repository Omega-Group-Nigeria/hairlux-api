import { Module, forwardRef } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { AdminBookingController } from './admin-booking.controller';
import { AdminCancellationPolicyController } from './admin-cancellation-policy.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../payment/payment.module';
import { MailModule } from '../mail/mail.module';
import { DiscountModule } from '../discount/discount.module';
import { ReservationService } from './services/reservation.service';
import { AvailabilityService } from './services/availability.service';
import { BookingCoreService } from './services/booking-core.service';
import { BookingAnalyticsService } from './services/booking-analytics.service';
import { BookingPaymentService } from './services/booking-payment.service';
import { WalletModule } from '../wallet/wallet.module';
import { BranchModule } from '../branch/branch.module';
import { BookingLinePricingService } from './services/booking-line-pricing.service';
import { BeauticianModule } from '../beautician/beautician.module';
import { HomeServiceLifecycleModule } from '../beautician/home-service-booking/home-service-lifecycle.module';
import { TrackingModule } from '../beautician/tracking/tracking.module';
import { MatchingModule } from '../beautician/matching/matching.module';
import { BookingMatchingService } from './services/booking-matching.service';
import { BookingCancellationPolicyService } from './services/booking-cancellation-policy.service';
import { CommsModule } from '../comms/comms.module';
import { BookingNotificationsModule } from '../notifications/booking/booking-notifications.module';

@Module({
  imports: [
    PrismaModule,
    PaymentModule,
    MailModule,
    DiscountModule,
    BranchModule,
    forwardRef(() => WalletModule),
    forwardRef(() => BeauticianModule),
    HomeServiceLifecycleModule,
    TrackingModule,
    MatchingModule,
    CommsModule,
    BookingNotificationsModule,
  ],
  controllers: [BookingController, AdminBookingController, AdminCancellationPolicyController],
  providers: [
    BookingService,
    ReservationService,
    AvailabilityService,
    BookingCoreService,
    BookingAnalyticsService,
    BookingPaymentService,
    BookingLinePricingService,
    BookingMatchingService,
    BookingCancellationPolicyService,
  ],
  exports: [BookingService],
})
export class BookingModule {}
