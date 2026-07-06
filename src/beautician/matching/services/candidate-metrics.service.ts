import { Injectable } from '@nestjs/common';
import { JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface BeauticianOfferMetrics {
  acceptanceRate: number;
  idleMinutes: number;
}

@Injectable()
export class CandidateMetricsService {
  private readonly lookbackDays = 30;
  private readonly defaultAcceptanceRate = 0.5;
  private readonly defaultIdleMinutes = 24 * 60;

  constructor(private readonly prisma: PrismaService) {}

  async loadMetrics(
    beauticianUserIds: string[],
  ): Promise<Map<string, BeauticianOfferMetrics>> {
    const metrics = new Map<string, BeauticianOfferMetrics>();

    if (!beauticianUserIds.length) {
      return metrics;
    }

    const since = new Date(Date.now() - this.lookbackDays * 24 * 60 * 60 * 1000);

    const offers = await this.prisma.jobOffer.findMany({
      where: {
        beauticianUserId: { in: beauticianUserIds },
        offeredAt: { gte: since },
      },
      select: {
        beauticianUserId: true,
        status: true,
        offeredAt: true,
        respondedAt: true,
      },
      orderBy: { offeredAt: 'desc' },
    });

    const grouped = new Map<string, typeof offers>();
    for (const offer of offers) {
      const bucket = grouped.get(offer.beauticianUserId) ?? [];
      bucket.push(offer);
      grouped.set(offer.beauticianUserId, bucket);
    }

    for (const userId of beauticianUserIds) {
      const userOffers = grouped.get(userId) ?? [];
      metrics.set(userId, this.computeMetrics(userOffers));
    }

    return metrics;
  }

  private computeMetrics(
    offers: Array<{
      status: JobOfferStatus;
      offeredAt: Date;
      respondedAt: Date | null;
    }>,
  ): BeauticianOfferMetrics {
    const responded = offers.filter((offer) => offer.respondedAt != null);
    const accepted = responded.filter(
      (offer) => offer.status === JobOfferStatus.ACCEPTED,
    ).length;

    const acceptanceRate =
      responded.length > 0
        ? accepted / responded.length
        : this.defaultAcceptanceRate;

    const latestOffer = offers[0];
    const idleMinutes = latestOffer
      ? Math.max(
          0,
          Math.round((Date.now() - latestOffer.offeredAt.getTime()) / 60000),
        )
      : this.defaultIdleMinutes;

    return { acceptanceRate, idleMinutes };
  }
}