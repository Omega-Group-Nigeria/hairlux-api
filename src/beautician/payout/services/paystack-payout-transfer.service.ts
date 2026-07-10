import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PayoutRequest, PayoutRequestStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../payment/paystack.service';
import { BeauticianBankAccountService } from './beautician-bank-account.service';
import { DailyPayoutLimitService } from './daily-payout-limit.service';
import { PayoutTransferSettlementService } from './payout-transfer-settlement.service';

@Injectable()
export class PaystackPayoutTransferService {
  private readonly logger = new Logger(PaystackPayoutTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly bankAccountService: BeauticianBankAccountService,
    private readonly settlementService: PayoutTransferSettlementService,
    private readonly dailyPayoutLimitService: DailyPayoutLimitService,
  ) {}

  async initiateForUser(
    userId: string,
    input: {
      amount: number;
      bankCode: string;
      accountNumber: string;
      accountName: string | null;
      recipientCode: string;
      processedById?: string;
      existingPayoutRequestId?: string;
    },
  ) {
    const amount = input.amount;
    await this.assertSufficientAvailableBalance(userId, amount, input.existingPayoutRequestId);
    // Re-check pool on transfer initiation (covers admin process of pending + auto)
    await this.dailyPayoutLimitService.assertWithinDailyLimit(
      amount,
      input.existingPayoutRequestId,
    );

    const transferReference = `PSTK-TRF-${randomBytes(8).toString('hex')}`;

    const payoutRequest = input.existingPayoutRequestId
      ? await this.prisma.payoutRequest.update({
          where: { id: input.existingPayoutRequestId },
          data: {
            status: PayoutRequestStatus.PROCESSING,
            processedById: input.processedById ?? null,
            paystackTransferReference: transferReference,
            paystackTransferCode: null,
            rejectionReason: null,
          },
        })
      : await this.prisma.payoutRequest.create({
          data: {
            userId,
            amount,
            bankCode: input.bankCode,
            accountNumber: input.accountNumber,
            accountName: input.accountName,
            status: PayoutRequestStatus.PROCESSING,
            processedById: input.processedById ?? null,
            paystackTransferReference: transferReference,
          },
        });

    try {
      const transfer = await this.paystackService.initiateTransfer({
        amount,
        recipientCode: input.recipientCode,
        reference: transferReference,
        reason: `HairLux payout ${payoutRequest.id}`,
      });

      return this.handleTransferOutcome(payoutRequest, transferReference, transfer);
    } catch (error) {
      await this.prisma.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: {
          status: PayoutRequestStatus.CANCELLED,
          rejectionReason:
            error instanceof Error ? error.message : 'Transfer initiation failed',
        },
      });

      this.logger.error(
        `Paystack payout failed for ${payoutRequest.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new BadRequestException(
        'Unable to initiate payout transfer. Please try again later.',
      );
    }
  }

  async processPendingRequest(payoutRequestId: string, adminUserId: string) {
    const payoutRequest = await this.prisma.payoutRequest.findUnique({
      where: { id: payoutRequestId },
    });

    if (!payoutRequest) {
      throw new NotFoundException('Payout request not found');
    }

    if (payoutRequest.status !== PayoutRequestStatus.PENDING) {
      throw new BadRequestException(
        `Payout request is already ${payoutRequest.status}`,
      );
    }

    const destination = await this.bankAccountService.getPayoutDestination(
      payoutRequest.userId,
    );

    return this.initiateForUser(payoutRequest.userId, {
      amount: Number(payoutRequest.amount),
      bankCode: payoutRequest.bankCode,
      accountNumber: payoutRequest.accountNumber,
      accountName: payoutRequest.accountName,
      recipientCode: destination.recipientCode,
      processedById: adminUserId,
      existingPayoutRequestId: payoutRequest.id,
    });
  }

  async approveTransfer(
    payoutRequestId: string,
    adminUserId: string,
    otp?: string,
  ) {
    const payoutRequest = await this.prisma.payoutRequest.findUnique({
      where: { id: payoutRequestId },
    });

    if (!payoutRequest) {
      throw new NotFoundException('Payout request not found');
    }

    if (payoutRequest.status !== PayoutRequestStatus.PROCESSING) {
      throw new BadRequestException(
        `Payout request is ${payoutRequest.status}, not awaiting transfer approval`,
      );
    }

    if (!payoutRequest.paystackTransferCode) {
      throw new BadRequestException(
        'Payout request has no Paystack transfer code to approve',
      );
    }

    try {
      const transfer = await this.paystackService.finalizeTransfer({
        transferCode: payoutRequest.paystackTransferCode,
        otp,
      });

      await this.prisma.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: { processedById: adminUserId },
      });

      return this.handleTransferOutcome(
        payoutRequest,
        payoutRequest.paystackTransferReference!,
        transfer,
      );
    } catch (error) {
      this.logger.error(
        `Paystack transfer approval failed for ${payoutRequest.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Unable to approve Paystack transfer',
      );
    }
  }

  async listAwaitingApproval() {
    const requests = await this.prisma.payoutRequest.findMany({
      where: {
        status: PayoutRequestStatus.PROCESSING,
        paystackTransferCode: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return requests.map((request) => this.mapAdminPayoutRequest(request));
  }

  private async handleTransferOutcome(
    payoutRequest: PayoutRequest,
    transferReference: string,
    transfer: { transfer_code: string; status: string },
  ) {
    await this.prisma.payoutRequest.update({
      where: { id: payoutRequest.id },
      data: { paystackTransferCode: transfer.transfer_code },
    });

    if (this.paystackService.isTransferFailureStatus(transfer.status)) {
      await this.settlementService.rejectTransfer(
        payoutRequest.id,
        transferReference,
        `Paystack transfer ${transfer.status}`,
      );

      throw new BadRequestException(
        'Paystack rejected the payout transfer. Please try again later.',
      );
    }

    if (this.paystackService.isTransferSuccessStatus(transfer.status)) {
      await this.settlementService.completeTransfer(payoutRequest, transferReference, {
        processedById: payoutRequest.processedById ?? undefined,
      });

      return {
        payoutRequestId: payoutRequest.id,
        amount: Number(payoutRequest.amount),
        status: PayoutRequestStatus.COMPLETED,
        transferReference,
        transferCode: transfer.transfer_code,
        requiresApproval: false,
        requiresOtp: false,
      };
    }

    const requiresOtp = transfer.status.toLowerCase() === 'otp';

    return {
      payoutRequestId: payoutRequest.id,
      amount: Number(payoutRequest.amount),
      status: PayoutRequestStatus.PROCESSING,
      transferReference,
      transferCode: transfer.transfer_code,
      requiresApproval: true,
      requiresOtp,
      paystackTransferStatus: transfer.status,
    };
  }

  private async assertSufficientAvailableBalance(
    userId: string,
    amount: number,
    excludePayoutRequestId?: string,
  ) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    const pendingAgg = await this.prisma.payoutRequest.aggregate({
      where: {
        userId,
        ...(excludePayoutRequestId
          ? { id: { not: excludePayoutRequestId } }
          : {}),
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
  }

  private mapAdminPayoutRequest(
    request: PayoutRequest & {
      user: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        phone: string | null;
      };
    },
  ) {
    return {
      id: request.id,
      amount: Number(request.amount),
      status: request.status,
      bankCode: request.bankCode,
      accountNumber: request.accountNumber,
      accountName: request.accountName,
      transferReference: request.paystackTransferReference,
      transferCode: request.paystackTransferCode,
      createdAt: request.createdAt,
      beautician: request.user,
    };
  }
}