import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class BeauticianStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async applyCompletedJobStats(
    tx: Prisma.TransactionClient,
    beauticianUserId: string,
    earningsAmount: number,
  ): Promise<void> {
    const profile = await tx.beauticianProfile.findUnique({
      where: { userId: beauticianUserId },
      select: { id: true },
    });

    if (!profile) {
      return;
    }

    const ratingAverage = await this.calculateRatingAverage(
      tx,
      beauticianUserId,
    );

    await tx.beauticianProfile.update({
      where: { userId: beauticianUserId },
      data: {
        totalJobsCompleted: { increment: 1 },
        totalEarnings: { increment: earningsAmount },
        ratingAverage,
      },
    });
  }

  async syncRatingAverage(
    tx: Prisma.TransactionClient,
    beauticianUserId: string,
  ): Promise<void> {
    const profile = await tx.beauticianProfile.findUnique({
      where: { userId: beauticianUserId },
      select: { id: true },
    });

    if (!profile) {
      return;
    }

    const ratingAverage = await this.calculateRatingAverage(
      tx,
      beauticianUserId,
    );

    await tx.beauticianProfile.update({
      where: { userId: beauticianUserId },
      data: { ratingAverage },
    });
  }

  private async calculateRatingAverage(
    tx: Prisma.TransactionClient,
    beauticianUserId: string,
  ): Promise<number> {
    const reviews = await tx.review.findMany({
      where: {
        status: ReviewStatus.APPROVED,
        booking: {
          assignedBeauticianUserId: beauticianUserId,
          status: BookingStatus.COMPLETED,
        },
      },
      select: { rating: true },
    });

    if (!reviews.length) {
      return 0;
    }

    const sum = reviews.reduce((total, review) => total + review.rating, 0);
    return Math.round((sum / reviews.length) * 100) / 100;
  }
}