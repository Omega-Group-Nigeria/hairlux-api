import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { PaymentModule } from '../../payment/payment.module';
import { HomeServiceSharedModule } from '../home-service-booking/home-service-shared.module';
import { WalletNotificationsModule } from '../../notifications/wallet/wallet-notifications.module';
import { PayrollModule } from '../../payroll/payroll.module';
import { EarningsCalculatorService } from './services/earnings-calculator.service';
import { ServiceCommissionRateService } from './services/service-commission-rate.service';
import { BeauticianStatsService } from './services/beautician-stats.service';
import { CreditServiceEarningsService } from './services/credit-service-earnings.service';
import { EarningsSummaryService } from './services/earnings-summary.service';
import { PayoutRequestService } from './services/payout-request.service';
import { AdminPayoutService } from './services/admin-payout.service';
import { AutoPayoutService } from './services/auto-payout.service';
import { BeauticianBankAccountService } from './services/beautician-bank-account.service';
import { PayoutTransferSettlementService } from './services/payout-transfer-settlement.service';
import { PaystackPayoutTransferService } from './services/paystack-payout-transfer.service';
import { AdminPayoutController } from './admin-payout.controller';
import { PaystackTransferWebhookController } from './paystack-transfer-webhook.controller';
import { PaystackTransferWebhookProcessor } from './processors/paystack-transfer-webhook.processor';
import { PaystackTransferApprovalService } from './services/paystack-transfer-approval.service';
import { DailyPayoutLimitService } from './services/daily-payout-limit.service';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    PaymentModule,
    HomeServiceSharedModule,
    WalletNotificationsModule,
    PayrollModule,
    // paystack-webhooks: same underlying Redis-backed queue WalletModule
    // registers -- needed here too for the symmetric charge.* forwarding
    // in PaystackTransferWebhookController (see that file's own comment).
    BullModule.registerQueue({ name: 'paystack-transfer-webhooks' }, { name: 'paystack-webhooks' }),
  ],
  controllers: [AdminPayoutController, PaystackTransferWebhookController],
  providers: [
    EarningsCalculatorService,
    ServiceCommissionRateService,
    BeauticianStatsService,
    CreditServiceEarningsService,
    EarningsSummaryService,
    DailyPayoutLimitService,
    PayoutRequestService,
    AdminPayoutService,
    AutoPayoutService,
    BeauticianBankAccountService,
    PayoutTransferSettlementService,
    PaystackPayoutTransferService,
    PaystackTransferApprovalService,
    PaystackTransferWebhookProcessor,
  ],
  exports: [
    EarningsCalculatorService,
    ServiceCommissionRateService,
    CreditServiceEarningsService,
    EarningsSummaryService,
    DailyPayoutLimitService,
    PayoutRequestService,
    AdminPayoutService,
    AutoPayoutService,
    BeauticianBankAccountService,
  ],
})
export class PayoutModule {}