import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { ShopPushNotifier } from './shop-push.notifier';

@Module({
  imports: [PushModule],
  providers: [ShopPushNotifier],
  exports: [ShopPushNotifier],
})
export class ShopNotificationsModule {}
