import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';

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
        'Insufficient wallet balance to complete this booking',
      );
    }

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
