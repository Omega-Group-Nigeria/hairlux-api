import { Injectable } from '@nestjs/common';
import { JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class OfferExclusionService {
  constructor(private readonly prisma: PrismaService) {}

  async getDeclinedBeauticianIds(bookingId: string): Promise<string[]> {
    const offers = await this.prisma.jobOffer.findMany({
      where: {
        bookingId,
        status: JobOfferStatus.DECLINED,
      },
      select: { beauticianUserId: true },
    });

    return [...new Set(offers.map((offer) => offer.beauticianUserId))];
  }

  async getExcludedBeauticianIds(bookingId: string): Promise<string[]> {
    const offers = await this.prisma.jobOffer.findMany({
      where: {
        bookingId,
        status: {
          in: [
            JobOfferStatus.DECLINED,
            JobOfferStatus.OFFERED,
            JobOfferStatus.ACCEPTED,
          ],
        },
      },
      select: {
        beauticianUserId: true,
        status: true,
        expiresAt: true,
      },
    });

    const now = new Date();
    const excluded = new Set<string>();

    for (const offer of offers) {
      if (
        offer.status === JobOfferStatus.DECLINED ||
        offer.status === JobOfferStatus.ACCEPTED
      ) {
        excluded.add(offer.beauticianUserId);
        continue;
      }

      if (
        offer.status === JobOfferStatus.OFFERED &&
        offer.expiresAt > now
      ) {
        excluded.add(offer.beauticianUserId);
      }
    }

    return [...excluded];
  }

  async getLastOfferedBeauticianUserId(
    bookingId: string,
  ): Promise<string | null> {
    const offer = await this.prisma.jobOffer.findFirst({
      where: { bookingId },
      orderBy: { offeredAt: 'desc' },
      select: { beauticianUserId: true },
    });

    return offer?.beauticianUserId ?? null;
  }
}