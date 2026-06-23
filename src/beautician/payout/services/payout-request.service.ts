import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  PayoutMode,
  PayoutRequestStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AutoPayoutService } from './auto-payout.service';
import { BeauticianBankAccountService } from './beautician-bank-account.service';

@Injectable()
export class PayoutRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPayoutService: AutoPayoutService,
    private readonly bankAccountService: BeauticianBankAccountService,
  ) {}

  async createRequest(
    userId: string,
    input: {
      amount: number;
      bankCode?: string;
      accountNumber?: string;
      accountName?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        beauticianProfile: { select: { id: true, isActive: true } },
      },
    });

    if (!user || user.role !== UserRole.BEAUTICIAN) {
      throw new ForbiddenException('Only beauticians can request withdrawals');
    }

    if (!user.beauticianProfile) {
      throw new ForbiddenException('Beautician profile not found');
    }

    if (!user.beauticianProfile.isActive) {
      throw new ForbiddenException(
        'Your beautician account is suspended and cannot request withdrawals',
      );
    }

    const settings = await this.prisma.homeServiceSettings.findFirst();

    if (input.amount <= 0) {
      throw new BadRequestException('Payout amount must be greater than zero');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    if (settings?.payoutMode === PayoutMode.AUTO) {
      return this.autoPayoutService.initiateWithdrawal(userId, {
        amount: input.amount,
      });
    }

    const destination = await this.bankAccountService.getPayoutDestination(userId);
    const bankCode = input.bankCode?.trim() || destination.bankCode;
    const accountNumber = input.accountNumber?.trim() || destination.accountNumber;
    const accountName =
      input.accountName?.trim() || destination.accountName || null;

    const pendingAgg = await this.prisma.payoutRequest.aggregate({
      where: {
        userId,
        status: {
          in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.PROCESSING],
        },
      },
      _sum: { amount: true },
    });

    const pendingAmount = Number(pendingAgg._sum.amount ?? 0);
    const availableBalance = Number(wallet.balance) - pendingAmount;

    if (input.amount > availableBalance) {
      throw new BadRequestException(
        `Insufficient available balance. Available: ₦${availableBalance.toFixed(2)}`,
      );
    }

    const payoutRequest = await this.prisma.payoutRequest.create({
      data: {
        userId,
        amount: input.amount,
        bankCode,
        accountNumber,
        accountName,
        status: PayoutRequestStatus.PENDING,
      },
    });

    return {
      id: payoutRequest.id,
      amount: Number(payoutRequest.amount),
      status: payoutRequest.status,
      bankCode: payoutRequest.bankCode,
      accountNumber: payoutRequest.accountNumber,
      accountName: payoutRequest.accountName,
      createdAt: payoutRequest.createdAt,
    };
  }
}