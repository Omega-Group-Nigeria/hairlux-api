import { Injectable, Logger } from '@nestjs/common';
import {
  PayoutRequestStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class PayoutTransferSettlementService {
  private readonly logger = new Logger(PayoutTransferSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async completeTransfer(
    payoutRequest: { id: string; userId: string; amount: unknown },
    reference: string,
    meta?: { processedById?: string },
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
          description: `Payout via Paystack transfer ${reference}`,
          metadata: {
            payoutRequestId: payoutRequest.id,
            paystackTransferReference: reference,
            ...(meta?.processedById
              ? { processedById: meta.processedById }
              : {}),
          },
        },
      });

      await tx.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: {
          status: PayoutRequestStatus.COMPLETED,
          processedAt: new Date(),
          transactionId: transaction.id,
          ...(meta?.processedById ? { processedById: meta.processedById } : {}),
        },
      });
    });

    void this.redis.del(`wallet:balance:${payoutRequest.userId}`);

    this.logger.log(`Transfer payout completed: ${reference}, ₦${amount}`);
    return { status: 'success', reference, amount };
  }

  async rejectTransfer(
    payoutRequestId: string,
    reference: string,
    reason: string,
  ) {
    await this.prisma.payoutRequest.update({
      where: { id: payoutRequestId },
      data: {
        status: PayoutRequestStatus.REJECTED,
        rejectionReason: reason,
      },
    });

    this.logger.warn(`Transfer payout rejected: ${reference} — ${reason}`);
    return { status: 'rejected', reference, reason };
  }
}