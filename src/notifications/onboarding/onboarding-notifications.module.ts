import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { OnboardingPushNotifier } from './onboarding-push.notifier';

@Module({
  imports: [PushModule],
  providers: [OnboardingPushNotifier],
  exports: [OnboardingPushNotifier],
})
export class OnboardingNotificationsModule {}
