import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { WalletPushNotifier } from './wallet-push.notifier';

@Module({
  imports: [PushModule],
  providers: [WalletPushNotifier],
  exports: [WalletPushNotifier],
})
export class WalletNotificationsModule {}
