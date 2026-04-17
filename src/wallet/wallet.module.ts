import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { AdminWalletController } from './admin-wallet.controller';
import { PaystackWebhookProcessor } from './paystack-webhook.processor';
import { MonnifyWebhookProcessor } from './monnify-webhook.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../payment/payment.module';
import { MailModule } from '../mail/mail.module';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [
    PrismaModule,
    PaymentModule,
    MailModule,
    ReferralModule,
    BullModule.registerQueue(
      { name: 'paystack-webhooks' },
      { name: 'monnify-webhooks' },
    ),
  ],
  providers: [WalletService, PaystackWebhookProcessor, MonnifyWebhookProcessor],
  controllers: [WalletController, AdminWalletController],
  exports: [WalletService],
})
export class WalletModule {}
