import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TransactionPaymentMethod,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

export interface WalletDebitParams {
  userId: string;
  amount: number;
  reference: string;
  description: string;
  type?: TransactionType;
  paymentMethod?: TransactionPaymentMethod;
  metadata?: Prisma.InputJsonValue;
  insufficientBalanceMessage?: string;
}

@Injectable()
export class WalletDebitService {
  async debitWalletAndRecordTx(
    tx: Prisma.TransactionClient,
    params: WalletDebitParams,
  ) {
    const wallet = await tx.wallet.findUnique({
      where: { userId: params.userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const debitResult = await tx.wallet.updateMany({
      where: {
        userId: params.userId,
        balance: { gte: params.amount },
      },
      data: {
        balance: {
          decrement: params.amount,
        },
      },
    });

    if (debitResult.count === 0) {
      throw new BadRequestException(
        params.insufficientBalanceMessage ??
          'Insufficient wallet balance to complete this payment',
      );
    }

    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        amount: params.amount,
        type: params.type ?? TransactionType.DEBIT,
        paymentMethod: params.paymentMethod ?? 'WALLET',
        description: params.description,
        reference: params.reference,
        status: TransactionStatus.COMPLETED,
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      },
    });

    return wallet;
  }
}