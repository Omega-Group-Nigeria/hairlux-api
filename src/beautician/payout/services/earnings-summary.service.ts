import { ForbiddenException, Injectable } from '@nestjs/common';
import { BookingStatus, PayoutRequestStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class EarningsSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(beauticianUserId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId: beauticianUserId },
      select: {
        totalEarnings: true,
        totalJobsCompleted: true,
        ratingAverage: true,
      },
    });

    if (!profile) {
      throw new ForbiddenException('Beautician profile not found');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: beauticianUserId },
      select: { balance: true },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthEarningsAgg, pendingPayoutAgg] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.SERVICE_EARNINGS,
          status: 'COMPLETED',
          wallet: { userId: beauticianUserId },
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.payoutRequest.aggregate({
        where: {
          userId: beauticianUserId,
          status: {
            in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.PROCESSING],
          },
        },
        _sum: { amount: true },
      }),
    ]);

    const availableBalance = Math.max(
      0,
      Number(wallet?.balance ?? 0) - Number(pendingPayoutAgg._sum.amount ?? 0),
    );

    return {
      lifetimeEarnings: Number(profile.totalEarnings),
      monthEarnings: Number(monthEarningsAgg._sum.amount ?? 0),
      walletBalance: Number(wallet?.balance ?? 0),
      availableBalance,
      pendingPayoutAmount: Number(pendingPayoutAgg._sum.amount ?? 0),
      totalJobsCompleted: profile.totalJobsCompleted,
      ratingAverage: Number(profile.ratingAverage),
      completedJobsThisMonth: await this.prisma.booking.count({
        where: {
          assignedBeauticianUserId: beauticianUserId,
          status: BookingStatus.COMPLETED,
          updatedAt: { gte: monthStart },
        },
      }),
    };
  }
}