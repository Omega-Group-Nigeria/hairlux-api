import { Module } from '@nestjs/common';
import { PushModule } from './push/push.module';
import { WalletNotificationsModule } from './wallet/wallet-notifications.module';
import { BookingNotificationsModule } from './booking/booking-notifications.module';
import { JobNotificationsModule } from './job/job-notifications.module';
import { ShopNotificationsModule } from './shop/shop-notifications.module';
import { OnboardingNotificationsModule } from './onboarding/onboarding-notifications.module';

/**
 * Aggregates notification domains. Import domain modules where needed,
 * or this root module when you want the full stack.
 */
@Module({
  imports: [
    PushModule,
    WalletNotificationsModule,
    BookingNotificationsModule,
    JobNotificationsModule,
    ShopNotificationsModule,
    OnboardingNotificationsModule,
  ],
  exports: [
    PushModule,
    WalletNotificationsModule,
    BookingNotificationsModule,
    JobNotificationsModule,
    ShopNotificationsModule,
    OnboardingNotificationsModule,
  ],
})
export class NotificationsModule {}
