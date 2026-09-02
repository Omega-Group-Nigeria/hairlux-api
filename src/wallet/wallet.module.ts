import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WalletService } from './wallet.service';
import { WalletDebitService } from './wallet-debit.service';
import { WalletController } from './wallet.controller';
import { AdminWalletController } from './admin-wallet.controller';
import { PaystackWebhookProcessor } from './paystack-webhook.processor';
import { MonnifyWebhookProcessor } from './monnify-webhook.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../payment/payment.module';
import { MailModule } from '../mail/mail.module';
import { ReferralModule } from '../referral/referral.module';
import { BookingModule } from '../booking/booking.module';
import { WalletNotificationsModule } from '../notifications/wallet/wallet-notifications.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    PrismaModule,
    PaymentModule,
    MailModule,
    ReferralModule,
    WalletNotificationsModule,
    FinanceModule,
    forwardRef(() => BookingModule),
    BullModule.registerQueue(
      { name: 'paystack-webhooks' },
      { name: 'monnify-webhooks' },
      // Dev Feedback Round 9: Paystack only supports ONE general Webhook
      // URL per mode -- registered in a different module (the Beautician
      // payout module) for its own transfer-webhook processor, but the
      // SAME underlying Redis-backed queue can be injected here too, so
      // this controller can forward transfer.* events there instead of
      // silently dropping them if this deposit endpoint happens to be
      // the one URL actually configured on the dashboard.
      { name: 'paystack-transfer-webhooks' },
    ),
  ],
  providers: [
    WalletService,
    WalletDebitService,
    PaystackWebhookProcessor,
    MonnifyWebhookProcessor,
  ],
  controllers: [WalletController, AdminWalletController],
  exports: [WalletService, WalletDebitService],
})
export class WalletModule { }