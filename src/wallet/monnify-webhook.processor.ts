import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
  Wallet,
} from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { ReferralService } from '../referral/referral.service';
import { BookingService } from '../booking/booking.service';

type TransactionWithWallet = Transaction & {
  wallet: Pick<Wallet, 'id' | 'userId'>;
};

interface MonnifyWebhookJobData {
  eventType: string; // e.g. 'SUCCESSFUL_TRANSACTION'
  eventData: {
    transactionReference: string;
    paymentReference: string;
    amountPaid: number | string;
    totalPayable: number | string;
    paymentStatus: string;
    paidOn: string;
    customer?: {
      email: string;
      name: string;
    };
  };
}

@Processor('monnify-webhooks')
export class MonnifyWebhookProcessor {
  private readonly logger = new Logger(MonnifyWebhookProcessor.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private redis: RedisService,
    private referralService: ReferralService,
    private bookingService: BookingService,
  ) {}

  @Process('deposit-webhook')
  async handleDepositWebhook(job: Job<MonnifyWebhookJobData>) {
    const { eventType, eventData } = job.data;

    this.logger.log(
      `Processing Monnify webhook: ${eventType}, ref: ${eventData.paymentReference}`,
    );

    try {
      if (eventType !== 'SUCCESSFUL_TRANSACTION') {
        this.logger.warn(`Ignoring non-success Monnify event: ${eventType}`);
        return { status: 'ignored', eventType };
      }

      // Find transaction by the internal paymentReference (our WALLET-xxx reference)
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          reference: eventData.paymentReference,
        },
        include: { wallet: true },
      });

      if (!transaction) {
        this.logger.error(
          `Transaction not found for Monnify ref: ${eventData.paymentReference}`,
        );
        return { status: 'not_found', reference: eventData.paymentReference };
      }

      if (transaction.type === TransactionType.BOOKING_PAYMENT) {
        this.logger.log(
          `Processing booking payment webhook: ${transaction.reference}`,
        );
        return this.bookingService.verifyBookingPaymentByReference(
          transaction.reference,
        );
      }

      return this.processTransaction(transaction, eventData);
    } catch (error) {
      this.logger.error(
        `Error processing Monnify webhook ${eventData.paymentReference}:`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error; // Bull will retry
    }
  }

  private async processTransaction(
    transaction: TransactionWithWallet,
    eventData: MonnifyWebhookJobData['eventData'],
  ) {
    if (transaction.status === TransactionStatus.COMPLETED) {
      this.logger.warn(
        `Transaction already processed: ${transaction.reference}`,
      );
      return { status: 'already_processed', reference: transaction.reference };
    }

    // Monnify can return numeric-looking strings (e.g. "100.00").
    // Normalize both sides and compare with tiny tolerance.
    const paidAmount = Number(eventData.amountPaid);
    const expectedAmount = Number(transaction.amount);
    if (
      !Number.isFinite(paidAmount) ||
      Math.abs(paidAmount - expectedAmount) > 0.001
    ) {
      this.logger.error(
        `Amount mismatch for ${transaction.reference}: expected ${transaction.amount}, got ${eventData.amountPaid}`,
      );
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.FAILED,
          paymentMethod: 'MONNIFY',
        },
      });
      return { status: 'amount_mismatch', reference: transaction.reference };
    }

    // Process in a DB transaction to handle race conditions
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.transaction.findUnique({
        where: { id: transaction.id },
      });
      if (locked?.status === TransactionStatus.COMPLETED) {
        throw new Error('Transaction already processed by another request');
      }

      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.COMPLETED,
          paymentMethod: 'MONNIFY',
          metadata: eventData as any,
        },
      });

      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { balance: { increment: transaction.amount } },
      });
    });

    this.logger.log(
      `Monnify webhook processed: ${transaction.reference}, ₦${transaction.amount} credited`,
    );

    // Invalidate caches without affecting payment processing success.
    try {
      await Promise.all([
        this.redis.del(`wallet:balance:${transaction.wallet.userId}`),
        this.redis.del('wallet:admin-stats'),
        this.redis.delByPattern('analytics:*'),
      ]);
    } catch (redisErr) {
      this.logger.warn(
        `Cache invalidation failed (non-critical): ${redisErr instanceof Error ? redisErr.message : String(redisErr)}`,
      );
    }

    // Send deposit success email (non-fatal)
    try {
      const wallet = await this.prisma.wallet.findUnique({
        where: { id: transaction.walletId },
        include: { user: { select: { email: true, firstName: true } } },
      });
      if (wallet?.user) {
        await this.mailService.sendDepositSuccessEmail(
          wallet.user.email,
          wallet.user.firstName,
          {
            amount: Number(transaction.amount),
            reference: transaction.reference,
            newBalance: Number(wallet.balance),
            date: new Date().toLocaleString('en-NG', {
              dateStyle: 'long',
              timeStyle: 'short',
              timeZone: 'Africa/Lagos',
            }),
          },
        );
      }
    } catch (mailError) {
      this.logger.warn(
        `Deposit email failed (non-fatal): ${mailError instanceof Error ? mailError.message : String(mailError)}`,
      );
    }

    // Process referral reward (non-fatal)
    try {
      await this.referralService.processReward(
        transaction.wallet.userId,
        Number(transaction.amount),
      );
    } catch (referralErr) {
      this.logger.warn(
        `Referral reward failed (non-fatal): ${referralErr instanceof Error ? referralErr.message : String(referralErr)}`,
      );
    }

    return {
      status: 'success',
      reference: transaction.reference,
      amount: Number(transaction.amount),
    };
  }
}
