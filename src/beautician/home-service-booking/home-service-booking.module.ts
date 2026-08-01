import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import {
  HOME_SERVICE_MATCHING_QUEUE,
  HomeServiceBookingService,
} from './home-service-booking.service';

@Module({
  imports: [BullModule.registerQueue({ name: HOME_SERVICE_MATCHING_QUEUE })],
  providers: [HomeServiceBookingService],
  exports: [HomeServiceBookingService],
})
export class HomeServiceBookingModule {}