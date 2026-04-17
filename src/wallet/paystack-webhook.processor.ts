import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { ReferralService } from '../referral/referral.service';

interface WebhookJobData {
  event: string;
  data: {
    reference: string;
    amount: number;
    status: string;
    paid_at?: string;
    customer?: {
      email: string;
    };
    metadata?: any;
  };
}

@Processor('paystack-webhooks')
export class PaystackWebhookProcessor {
  private readonly logger = new Logger(PaystackWebhookProcessor.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private redis: RedisService,
    private referralService: ReferralService,
  ) {}

  @Process('deposit-webhook')
  async handleDepositWebhook(job: Job<WebhookJobData>) {
    const { event, data } = job.data;

    this.logger.log(
      `Processing webhook: ${event}, reference: ${data.reference}`,
    );

    try {
      if (event !== 'charge.success') {
        this.logger.warn(`Ignoring non-success event: ${event}`);
        return { status: 'ignored', event };
      }

      // Find transaction
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          reference: data.reference,
        },
        include: {
          wallet: true,
        },
      });

      if (!transaction) {
        this.logger.error(`Transaction not found: ${data.reference}`);
        return { status: 'not_found', reference: data.reference };
      }

      // Check if already processed
      if (transaction.status === TransactionStatus.COMPLETED) {
        this.logger.warn(`Transaction already processed: ${data.reference}`);
        return { status: 'already_processed', reference: data.reference };
      }

      // Verify amount matches
      const webhookAmount = data.amount / 100; // Convert from kobo
      if (webhookAmount !== Number(transaction.amount)) {
        this.logger.error(
          `Amount mismatch for ${data.reference}: expected ${transaction.amount}, got ${webhookAmount}`,
        );

        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.FAILED,
            paymentMethod: 'PAYSTACK',
          },
        });

        return { status: 'amount_mismatch', reference: data.reference };
      }

      // Process payment in transaction to handle race conditions
      await this.prisma.$transaction(async (tx) => {
        // Double-check status hasn't changed
        const lockedTransaction = await tx.transaction.findUnique({
          where: { id: transaction.id },
        });

        if (lockedTransaction?.status === TransactionStatus.COMPLETED) {
          throw new Error('Transaction already processed by another request');
        }

        // Update transaction
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.COMPLETED,
            paymentMethod: 'PAYSTACK',
            metadata: data as any,
          },
        });

        // Credit wallet
        await tx.wallet.update({
          where: { id: transaction.walletId },
          data: {
            balance: {
              increment: transaction.amount,
            },
          },
        });
      });

      this.logger.log(
        `Webhook processed successfully: ${data.reference}, ₦${transaction.amount} credited`,
      );

      // Invalidate wallet balance + admin stats caches
      void Promise.all([
        this.redis.del(`wallet:balance:${transaction.wallet.userId}`),
        this.redis.del('wallet:admin-stats'),
        this.redis.delByPattern('analytics:*'),
      ]);

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
              reference: data.reference,
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
        reference: data.reference,
        amount: Number(transaction.amount),
      };
    } catch (error) {
      this.logger.error(
        `Error processing webhook ${data.reference}:`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error; // Bull will retry
    }
  }
}
