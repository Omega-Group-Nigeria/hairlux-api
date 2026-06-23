import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class BeauticianStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async applyCompletedJobStats(
    tx: Prisma.TransactionClient,
    beauticianUserId: string,
    earningsAmount: number,
    customerRating?: number | null,
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
      customerRating,
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

  private async calculateRatingAverage(
    tx: Prisma.TransactionClient,
    beauticianUserId: string,
    latestRating?: number | null,
  ): Promise<number> {
    const ratings = await tx.booking.findMany({
      where: {
        assignedBeauticianUserId: beauticianUserId,
        status: BookingStatus.COMPLETED,
        customerRating: { not: null },
      },
      select: { customerRating: true },
    });

    const values = ratings
      .map((booking) => booking.customerRating)
      .filter((rating): rating is number => rating != null);

    if (latestRating != null && !values.length) {
      return latestRating;
    }

    if (!values.length) {
      return 0;
    }

    const sum = values.reduce((total, rating) => total + rating, 0);
    return Math.round((sum / values.length) * 100) / 100;
  }
}