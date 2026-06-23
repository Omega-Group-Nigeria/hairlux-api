import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PayoutRequestStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../payment/paystack.service';
import { BeauticianBankAccountService } from './beautician-bank-account.service';

@Injectable()
export class AutoPayoutService {
  private readonly logger = new Logger(AutoPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly bankAccountService: BeauticianBankAccountService,
  ) {}

  async initiateWithdrawal(userId: string, input: { amount: number }) {
    const destination = await this.bankAccountService.getPayoutDestination(userId);
    const amount = input.amount;

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    const pendingAgg = await this.prisma.payoutRequest.aggregate({
      where: {
        userId,
        status: {
          in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.PROCESSING],
        },
      },
      _sum: { amount: true },
    });

    const reserved = Number(pendingAgg._sum.amount ?? 0);
    const availableBalance = Number(wallet.balance) - reserved;

    if (amount > availableBalance) {
      throw new BadRequestException(
        `Insufficient available balance. Available: ₦${availableBalance.toFixed(2)}`,
      );
    }

    const transferReference = `PSTK-TRF-${randomBytes(8).toString('hex')}`;

    const payoutRequest = await this.prisma.payoutRequest.create({
      data: {
        userId,
        amount,
        bankCode: destination.bankCode,
        accountNumber: destination.accountNumber,
        accountName: destination.accountName,
        status: PayoutRequestStatus.PROCESSING,
        paystackTransferReference: transferReference,
      },
    });

    try {
      await this.paystackService.initiateTransfer({
        amount,
        recipientCode: destination.recipientCode,
        reference: transferReference,
        reason: `HairLux payout ${payoutRequest.id}`,
      });
    } catch (error) {
      await this.prisma.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: { status: PayoutRequestStatus.CANCELLED },
      });

      this.logger.error(
        `Auto payout failed for ${payoutRequest.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new BadRequestException(
        'Unable to initiate payout transfer. Please try again later.',
      );
    }

    return {
      id: payoutRequest.id,
      amount,
      status: PayoutRequestStatus.PROCESSING,
      transferReference,
      createdAt: payoutRequest.createdAt,
    };
  }
}