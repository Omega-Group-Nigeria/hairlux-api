import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { JobPushNotifier } from './job-push.notifier';

@Module({
  imports: [PushModule],
  providers: [JobPushNotifier],
  exports: [JobPushNotifier],
})
export class JobNotificationsModule {}
