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
import { MonnifyService } from '../payment/monnify.service';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { InitializeDepositDto } from './dto/initialize-deposit.dto';
import { AdminQueryTransactionsDto } from './dto/admin-query-transactions.dto';
import { AdminWalletStatsDto } from './dto/admin-wallet-stats.dto';
import {
  TransactionType,
  TransactionStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';

const TRANSACTION_GATEWAY = {
  PAYSTACK: 'PAYSTACK',
  MONNIFY: 'MONNIFY',
} as const;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly MAX_DEPOSITS_PER_MINUTE: number;
  private readonly MAX_DEPOSIT_AMOUNT_PER_DAY: number;

  constructor(
    private prisma: PrismaService,
    private paystackService: PaystackService,
    private monnifyService: MonnifyService,
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

    const provider = dto.provider ?? 'paystack';
    const paymentMethod =
      provider === 'monnify'
        ? TRANSACTION_GATEWAY.MONNIFY
        : TRANSACTION_GATEWAY.PAYSTACK;
    const providerPrefix =
      provider === 'monnify'
        ? 'MONF'
        : 'PSTK';

    // Generate unique reference
    const reference = `WALLET-${providerPrefix}-${Date.now()}-${randomBytes(8).toString('hex')}`;

    // Create pending transaction record
    const transaction = await this.prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        paymentMethod,
        reference,
        description: `Wallet deposit of ₦${amount}`,
        metadata: { provider } as any,
      },
    });

    this.logger.log(
      `Initializing ${provider} deposit for user ${userId}: ₦${amount}, ref: ${reference}`,
    );

    if (provider === 'monnify') {
      const monnifyData = await this.monnifyService.initializePayment(
        user.email,
        amount,
        reference,
        `${user.firstName} ${user.lastName}`,
      );

      // Store the monnify transaction reference for later verification
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          metadata: {
            provider,
            monnifyTransactionReference: monnifyData.responseBody.transactionReference,
            monnifyPaymentReference: monnifyData.responseBody.paymentReference,
          } as any,
        },
      });

      return {
        provider: 'monnify' as const,
        checkoutUrl: monnifyData.responseBody.checkoutUrl,
        transactionReference: monnifyData.responseBody.transactionReference,
        paymentReference: monnifyData.responseBody.paymentReference,
        reference,
        amount,
      };
    }

    // Paystack
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
      provider: 'paystack' as const,
      authorization_url: paymentData.data.authorization_url,
      access_code: paymentData.data.access_code,
      reference,
      amount,
    };
  }

  async verifyDeposit(
    userId: string,
    reference: string,
    provider?: 'paystack' | 'monnify',
  ) {
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

    const metadata = transaction.metadata as any;
    const metadataProvider = metadata?.provider;
    const storedProvider =
      metadataProvider === 'monnify' || metadataProvider === 'paystack'
        ? metadataProvider
        : reference.includes('-MONF-')
          ? 'monnify'
          : 'paystack';

    if (provider && provider !== storedProvider) {
      this.logger.warn(
        `Provider mismatch on verify for ${reference}: request=${provider}, stored=${storedProvider}. Using stored provider.`,
      );
    }

    // ── Monnify verification path ────────────────────────────────────────────
    if (storedProvider === 'monnify') {
      const monnifyRef = metadata?.monnifyTransactionReference;

      if (!monnifyRef) {
        throw new BadRequestException(
          'Monnify transaction reference not found for this deposit',
        );
      }

      const verification = await this.monnifyService.verifyPayment(monnifyRef);

      if (verification.responseBody.paymentStatus !== 'PAID') {
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.FAILED,
            paymentMethod: TRANSACTION_GATEWAY.MONNIFY,
          },
        });
        throw new BadRequestException(
          `Payment not completed. Status: ${verification.responseBody.paymentStatus}`,
        );
      }

      // Monnify amounts are already in Naira
      const paidAmount = verification.responseBody.amountPaid;
      if (paidAmount !== Number(transaction.amount)) {
        this.logger.error(
          `Amount mismatch: expected ${transaction.amount}, got ${paidAmount}`,
        );
        throw new BadRequestException('Payment amount mismatch');
      }

      const result = await this.prisma.$transaction(async (tx) => {
        const lockedTransaction = await tx.transaction.findUnique({
          where: { id: transaction.id },
        });
        if (lockedTransaction?.status === TransactionStatus.COMPLETED) {
          throw new ConflictException('Transaction already processed');
        }
        const updatedTransaction = await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.COMPLETED,
            paymentMethod: TRANSACTION_GATEWAY.MONNIFY,
            metadata: verification.responseBody as any,
          },
        });
        await tx.wallet.update({
          where: { id: transaction.walletId },
          data: { balance: { increment: transaction.amount } },
        });
        return updatedTransaction;
      });

      this.logger.log(
        `Monnify deposit completed for user ${userId}: ₦${transaction.amount}, ref: ${reference}`,
      );
      void Promise.all([
        this.redis.del(`wallet:balance:${userId}`),
        this.redis.del('wallet:admin-stats'),
        this.redis.delByPattern('analytics:*'),
      ]);
      return {
        status: 'success',
        message: 'Deposit successful',
        transaction: { ...result, amount: Number(result.amount) },
      };
    }

    // ── Paystack verification path ───────────────────────────────────────────
    const verification = await this.paystackService.verifyPayment(reference);

    if (verification.data.status !== 'success') {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.FAILED,
          paymentMethod: TRANSACTION_GATEWAY.PAYSTACK,
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
          paymentMethod: TRANSACTION_GATEWAY.PAYSTACK,
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

  async adminGetWalletStats(query: AdminWalletStatsDto = {}) {
    const { startDate, endDate } = query;
    const cacheKey = `wallet:admin-stats:${startDate || ''}:${endDate || ''}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      // If time component is missing, assume end of day
      if (!endDate.includes('T')) {
        end.setHours(23, 59, 59, 999);
      }
      dateFilter.lte = end;
    }

    const walletWhere: any = {};
    const transactionWhere: any = {};
    
    // Only apply date filter if dates are provided
    if (Object.keys(dateFilter).length > 0) {
        // For wallets, we only filter by creation date if requested.
        // HOWEVER: The user's issue suggests they might want TOTAL system balance but FILTERED transactions.
        // If I filter wallets by date, I get stats for NEW wallets.
        // If the user wants stats for the period, usually wallet stats are "new signups".
        // Let's stick to that interpretation, but ensure transaction stats are correct.
        walletWhere.createdAt = dateFilter;
        transactionWhere.createdAt = dateFilter;
    }

    const [
      totalWallets,
      balanceAggregate,
      transactionStats,
      failedCount,
      pendingCount,
    ] = await Promise.all([
      this.prisma.wallet.count({ where: walletWhere }),
      this.prisma.wallet.aggregate({
        _sum: { balance: true },
        _avg: { balance: true },
        _max: { balance: true },
        where: walletWhere,
      }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        _sum: { amount: true },
        _count: { id: true },
        where: { 
            status: TransactionStatus.COMPLETED,
            ...transactionWhere 
        },
      }),
      this.prisma.transaction.count({
        where: { 
            status: TransactionStatus.FAILED,
            ...transactionWhere
        },
      }),
      this.prisma.transaction.count({
        where: { 
            status: TransactionStatus.PENDING,
            ...transactionWhere
        },
      }),
    ]);

    // Ensure all transaction types are present in the response structure even if count is 0
    // This matches user expectation of consistent data shape
    const statsByType: Record<string, { totalAmount: number; count: number }> = {
      DEPOSIT: { totalAmount: 0, count: 0 },
      DEBIT: { totalAmount: 0, count: 0 },
      REFUND: { totalAmount: 0, count: 0 },
      // Add other types if necessary, e.g., CREDIT
    };

    transactionStats.forEach((s) => {
      statsByType[s.type] = {
        totalAmount: Number(s._sum.amount || 0),
        count: s._count.id,
      };
    });

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
    await this.redis.set(cacheKey, statsResult, 60);
    return statsResult;
  }

  async adminGetAllTransactions(query: AdminQueryTransactionsDto) {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      userId,
      startDate,
      endDate,
    } = query;

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (userId) where.wallet = { userId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          status: true,
          paymentMethod: true,
          reference: true,
          description: true,
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
