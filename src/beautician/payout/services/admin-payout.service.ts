import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayoutRequestStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class AdminPayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async processPayout(payoutRequestId: string, adminUserId: string) {
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

    const amount = Number(payoutRequest.amount);
    const reference = `PAYOUT-${payoutRequest.id}-${randomBytes(4).toString('hex')}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: payoutRequest.userId },
      });

      if (!wallet) {
        throw new BadRequestException('Beautician wallet not found');
      }

      if (Number(wallet.balance) < amount) {
        throw new BadRequestException(
          'Beautician wallet balance is insufficient for this payout',
        );
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
          paymentMethod: 'WALLET',
          reference,
          description: `Payout processed for request ${payoutRequest.id}`,
          metadata: {
            payoutRequestId: payoutRequest.id,
            bankCode: payoutRequest.bankCode,
            accountNumber: payoutRequest.accountNumber,
            accountName: payoutRequest.accountName,
            processedById: adminUserId,
          },
        },
      });

      const updatedRequest = await tx.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: {
          status: PayoutRequestStatus.COMPLETED,
          processedById: adminUserId,
          processedAt: new Date(),
          transactionId: transaction.id,
        },
      });

      return {
        payoutRequest: updatedRequest,
        transaction,
      };
    });

    void this.redis.del(`wallet:balance:${payoutRequest.userId}`);

    return {
      payoutRequestId: result.payoutRequest.id,
      amount,
      status: result.payoutRequest.status,
      transactionId: result.transaction.id,
      reference: result.transaction.reference,
      processedAt: result.payoutRequest.processedAt,
    };
  }

  async listPending() {
    const requests = await this.prisma.payoutRequest.findMany({
      where: { status: PayoutRequestStatus.PENDING },
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

    return requests.map((request) => ({
      id: request.id,
      amount: Number(request.amount),
      status: request.status,
      bankCode: request.bankCode,
      accountNumber: request.accountNumber,
      accountName: request.accountName,
      createdAt: request.createdAt,
      beautician: request.user,
    }));
  }
}