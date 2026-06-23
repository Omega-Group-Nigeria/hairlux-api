import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import {
  PayoutRequestStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

interface TransferWebhookJobData {
  event: string;
  data: {
    reference: string;
    status?: string;
    amount?: number;
    transfer_code?: string;
  };
}

@Processor('paystack-transfer-webhooks')
export class PaystackTransferWebhookProcessor {
  private readonly logger = new Logger(PaystackTransferWebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Process('transfer-webhook')
  async handleTransferWebhook(job: Job<TransferWebhookJobData>) {
    const { event, data } = job.data;
    const reference = data.reference;

    if (!reference) {
      this.logger.warn(`Transfer webhook missing reference for event ${event}`);
      return { status: 'ignored', reason: 'missing_reference' };
    }

    const payoutRequest = await this.prisma.payoutRequest.findUnique({
      where: { paystackTransferReference: reference },
    });

    if (!payoutRequest) {
      this.logger.warn(`No payout request for transfer reference ${reference}`);
      return { status: 'not_found', reference };
    }

    if (payoutRequest.status === PayoutRequestStatus.COMPLETED) {
      return { status: 'already_processed', reference };
    }

    if (event === 'transfer.success') {
      return this.completeTransfer(payoutRequest, reference);
    }

    if (event === 'transfer.failed' || event === 'transfer.reversed') {
      await this.prisma.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: {
          status: PayoutRequestStatus.REJECTED,
          rejectionReason: `Paystack ${event}`,
        },
      });

      return { status: 'rejected', reference, event };
    }

    this.logger.log(`Ignoring transfer webhook event: ${event}`);
    return { status: 'ignored', event };
  }

  private async completeTransfer(
    payoutRequest: { id: string; userId: string; amount: unknown },
    reference: string,
  ) {
    const amount = Number(payoutRequest.amount);

    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.payoutRequest.findUnique({
        where: { id: payoutRequest.id },
      });

      if (!locked || locked.status === PayoutRequestStatus.COMPLETED) {
        throw new Error('Payout already completed');
      }

      const wallet = await tx.wallet.findUnique({
        where: { userId: payoutRequest.userId },
      });

      if (!wallet) {
        throw new Error('Wallet not found for payout completion');
      }

      if (Number(wallet.balance) < amount) {
        throw new Error('Insufficient wallet balance at transfer completion');
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount,
          type: TransactionType.PAYOUT_COMPLETED,
          status: TransactionStatus.COMPLETED,
          paymentMethod: 'PAYSTACK',
          reference: `PAYOUT-${payoutRequest.id}`,
          description: `Auto payout via Paystack transfer ${reference}`,
          metadata: {
            payoutRequestId: payoutRequest.id,
            paystackTransferReference: reference,
          },
        },
      });

      await tx.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: {
          status: PayoutRequestStatus.COMPLETED,
          processedAt: new Date(),
          transactionId: transaction.id,
        },
      });
    });

    void this.redis.del(`wallet:balance:${payoutRequest.userId}`);

    this.logger.log(`Transfer payout completed: ${reference}, ₦${amount}`);
    return { status: 'success', reference, amount };
  }
}