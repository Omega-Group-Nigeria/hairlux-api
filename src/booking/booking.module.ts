import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { AdminBookingController } from './admin-booking.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../payment/payment.module';
import { MailModule } from '../mail/mail.module';
import { DiscountModule } from '../discount/discount.module';
import { ReservationService } from './services/reservation.service';
import { AvailabilityService } from './services/availability.service';
import { BookingCoreService } from './services/booking-core.service';
import { BookingAnalyticsService } from './services/booking-analytics.service';
import { BookingPaymentService } from './services/booking-payment.service';
import { BookingWalletService } from './services/booking-wallet.service';

@Module({
  imports: [PrismaModule, PaymentModule, MailModule, DiscountModule],
  controllers: [BookingController, AdminBookingController],
  providers: [
    BookingService,
    ReservationService,
    AvailabilityService,
    BookingWalletService,
    BookingCoreService,
    BookingAnalyticsService,
    BookingPaymentService,
  ],
  exports: [BookingService],
})
export class BookingModule {}
