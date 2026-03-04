import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { AdminBookingController } from './admin-booking.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../payment/payment.module';
import { MailModule } from '../mail/mail.module';
import { DiscountModule } from '../discount/discount.module';

@Module({
  imports: [PrismaModule, PaymentModule, MailModule, DiscountModule],
  controllers: [BookingController, AdminBookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
