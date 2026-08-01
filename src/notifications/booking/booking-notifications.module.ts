import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { BookingPushNotifier } from './booking-push.notifier';

@Module({
  imports: [PushModule],
  providers: [BookingPushNotifier],
  exports: [BookingPushNotifier],
})
export class BookingNotificationsModule {}
