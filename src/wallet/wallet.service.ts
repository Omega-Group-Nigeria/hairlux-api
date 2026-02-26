import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../payment/paystack.service';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { InitializeDepositDto } from './dto/initialize-deposit.dto';
import { AdminQueryTransactionsDto } from './dto/admin-query-transactions.dto';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly MAX_DEPOSITS_PER_MINUTE: number;
  private readonly MAX_DEPOSIT_AMOUNT_PER_DAY: number;

  constructor(
    private prisma: PrismaService,
    private paystackService: PaystackService,
    private configService: ConfigService,
    private redis: RedisService,
  ) {
    this.MAX_DEPOSITS_PER_MINUTE = this.configService.get<number>(
      'WALLET_MAX_DEPOSITS_PER_MINUTE',
      3,
    );
    this.MAX_DEPOSIT_AMOUNT_PER_DAY = this.configService.get<number>(
      'WALLET_MAX_DAILY_DEPOSIT_AMOUNT',
      100000,
    );
  }

  async getBalance(userId: string) {
    const cacheKey = `wallet:balance:${userId}`;
    const cached = await this.redis.get<{ balance: number; currency: string }>(
      cacheKey,
    );
    if (cached) return cached;

    // Get or create wallet
    const wallet = await this.getOrCreateWallet(userId);

    this.logger.log(`Balance check for user ${userId}: ₦${wallet.balance}`);

    const result = { balance: Number(wallet.balance), currency: 'NGN' };
    await this.redis.set(cacheKey, result, 15);
    return result;
  }

  async getTransactions(userId: string, query: GetTransactionsDto) {
    const { page = 1, limit = 20, type, status } = query;

    // Get user's wallet
    const wallet = await this.getOrCreateWallet(userId);

    // Build filter
    const where: any = {
      walletId: wallet.id,
    };

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    // Get paginated transactions
    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    this.logger.log(
      `Retrieved ${transactions.length} transactions for user ${userId}`,
    );

    return {
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async initializeDeposit(userId: string, dto: InitializeDepositDto) {
    const { amount } = dto;

    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Fraud prevention: Check velocity limits
    await this.checkVelocityLimits(userId, amount);

    // Get or create wallet
    const wallet = await this.getOrCreateWallet(userId);

    // Generate unique reference
    const reference = `WALLET-${Date.now()}-${randomBytes(8).toString('hex')}`;

    // Create pending transaction record
    const transaction = await this.prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        reference,
        description: `Wallet deposit of ₦${amount}`,
      },
    });

    this.logger.log(
      `Initializing deposit for user ${userId}: ₦${amount}, ref: ${reference}`,
    );

    // Initialize Paystack payment
    const paymentData = await this.paystackService.initializePayment(
      user.email,
      amount,
      reference,
      {
        userId,
        walletId: wallet.id,
        transactionId: transaction.id,
        type: 'WALLET_DEPOSIT',
      },
    );

    return {
      authorization_url: paymentData.data.authorization_url,
      access_code: paymentData.data.access_code,
      reference,
      amount,
    };
  }

  async verifyDeposit(userId: string, reference: string) {
    // Get transaction by reference
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        reference,
        type: TransactionType.DEPOSIT,
      },
      include: {
        wallet: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Verify user owns this wallet
    if (transaction.wallet.userId !== userId) {
      throw new BadRequestException('Unauthorized transaction access');
    }

    // Check if already processed
    if (transaction.status === TransactionStatus.COMPLETED) {
      this.logger.warn(
        `Duplicate verification attempt for reference: ${reference}`,
      );
      return {
        status: 'success',
        message: 'Transaction already completed',
        transaction: {
          ...transaction,
          amount: Number(transaction.amount),
        },
      };
    }

    // Verify payment with Paystack
    const verification = await this.paystackService.verifyPayment(reference);

    if (verification.data.status !== 'success') {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.FAILED,
          paystackReference: verification.data.reference,
        },
      });

      throw new BadRequestException('Payment verification failed');
    }

    // Verify amount matches
    const paidAmount = verification.data.amount / 100; // Convert from kobo
    if (paidAmount !== Number(transaction.amount)) {
      this.logger.error(
        `Amount mismatch: expected ${transaction.amount}, got ${paidAmount}`,
      );
      throw new BadRequestException('Payment amount mismatch');
    }

    // Use transaction to prevent race conditions
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the transaction record for update
      const lockedTransaction = await tx.transaction.findUnique({
        where: { id: transaction.id },
      });

      // Double-check status hasn't changed
      if (lockedTransaction?.status === TransactionStatus.COMPLETED) {
        throw new ConflictException('Transaction already processed');
      }

      // Update transaction status
      const updatedTransaction = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.COMPLETED,
          paystackReference: verification.data.reference,
          metadata: verification.data as any,
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

      return updatedTransaction;
    });

    this.logger.log(
      `Deposit completed for user ${userId}: ₦${transaction.amount}, ref: ${reference}`,
    );

    // Invalidate balance + admin stats caches
    void Promise.all([
      this.redis.del(`wallet:balance:${userId}`),
      this.redis.del('wallet:admin-stats'),
      this.redis.delByPattern('analytics:*'),
    ]);

    return {
      status: 'success',
      message: 'Deposit successful',
      transaction: {
        ...result,
        amount: Number(result.amount),
      },
    };
  }

  // ─── Admin Methods ──────────────────────────────────────────────────────────

  async adminGetWalletStats() {
    const cached = await this.redis.get('wallet:admin-stats');
    if (cached) return cached;

    const [
      totalWallets,
      balanceAggregate,
      transactionStats,
      failedCount,
      pendingCount,
    ] = await Promise.all([
      this.prisma.wallet.count(),
      this.prisma.wallet.aggregate({
        _sum: { balance: true },
        _avg: { balance: true },
        _max: { balance: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        _sum: { amount: true },
        _count: { id: true },
        where: { status: TransactionStatus.COMPLETED },
      }),
      this.prisma.transaction.count({
        where: { status: TransactionStatus.FAILED },
      }),
      this.prisma.transaction.count({
        where: { status: TransactionStatus.PENDING },
      }),
    ]);

    const statsByType = transactionStats.reduce<
      Record<string, { totalAmount: number; count: number }>
    >((acc, s) => {
      acc[s.type] = {
        totalAmount: Number(s._sum.amount || 0),
        count: s._count.id,
      };
      return acc;
    }, {});

    this.logger.log('Admin fetched wallet stats');

    const statsResult = {
      totalWallets,
      totalBalance: Number(balanceAggregate._sum.balance || 0),
      averageBalance: Number(balanceAggregate._avg.balance || 0),
      highestBalance: Number(balanceAggregate._max.balance || 0),
      transactions: {
        byType: statsByType,
        failed: failedCount,
        pending: pendingCount,
      },
    };
    await this.redis.set('wallet:admin-stats', statsResult, 60);
    return statsResult;
  }

  async adminGetAllTransactions(query: AdminQueryTransactionsDto) {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      userId,
      dateFrom,
      dateTo,
    } = query;

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (userId) where.wallet = { userId };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          status: true,
          reference: true,
          description: true,
          paystackReference: true,
          createdAt: true,
          updatedAt: true,
          wallet: {
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    this.logger.log(
      `Admin fetched all transactions (page ${page}, total ${total})`,
    );

    return {
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          userId,
          balance: 0,
        },
      });
      this.logger.log(`Created wallet for user ${userId}`);
    }

    return wallet;
  }

  private async checkVelocityLimits(userId: string, amount: number) {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const wallet = await this.getOrCreateWallet(userId);

    // Check deposits in last minute
    const recentDeposits = await this.prisma.transaction.count({
      where: {
        walletId: wallet.id,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        createdAt: {
          gte: oneMinuteAgo,
        },
      },
    });

    if (recentDeposits >= this.MAX_DEPOSITS_PER_MINUTE) {
      this.logger.warn(
        `Velocity limit exceeded for user ${userId}: ${recentDeposits} deposits in last minute`,
      );
      throw new BadRequestException(
        `Too many deposits. Maximum ${this.MAX_DEPOSITS_PER_MINUTE} deposits per minute allowed.`,
      );
    }

    // Check total deposit amount in last 24 hours
    const dailyDeposits = await this.prisma.transaction.aggregate({
      where: {
        walletId: wallet.id,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        createdAt: {
          gte: oneDayAgo,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const totalDaily = Number(dailyDeposits._sum.amount || 0);
    if (totalDaily + amount > this.MAX_DEPOSIT_AMOUNT_PER_DAY) {
      this.logger.warn(
        `Daily deposit limit exceeded for user ${userId}: ₦${totalDaily} + ₦${amount}`,
      );
      throw new BadRequestException(
        `Daily deposit limit exceeded. Maximum ₦${this.MAX_DEPOSIT_AMOUNT_PER_DAY.toLocaleString()} per day.`,
      );
    }

    // Check for anomaly: multiple pending transactions
    const pendingCount = await this.prisma.transaction.count({
      where: {
        walletId: wallet.id,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        createdAt: {
          gte: oneMinuteAgo,
        },
      },
    });

    if (pendingCount >= 3) {
      this.logger.warn(
        `Too many pending deposits for user ${userId}: ${pendingCount}`,
      );
      throw new BadRequestException(
        'You have too many pending deposits. Please complete or cancel existing deposits first.',
      );
    }
  }
}
