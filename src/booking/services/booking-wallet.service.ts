import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

@Injectable()
export class BookingWalletService {
  async debitWalletAndRecordTx(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      amount: number;
      reference: string;
      description: string;
    },
  ) {
    const wallet = await tx.wallet.findUnique({
      where: { userId: params.userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const availableBalance = Number(wallet.balance);
    if (availableBalance < params.amount) {
      throw new BadRequestException(
        `Insufficient wallet balance. Required: ${params.amount}, Available: ${availableBalance}`,
      );
    }

    await tx.wallet.update({
      where: { userId: params.userId },
      data: {
        balance: {
          decrement: params.amount,
        },
      },
    });

    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        amount: params.amount,
        type: TransactionType.DEBIT,
        paymentMethod: 'WALLET',
        description: params.description,
        reference: params.reference,
        status: TransactionStatus.COMPLETED,
      },
    });

    return wallet;
  }
}
