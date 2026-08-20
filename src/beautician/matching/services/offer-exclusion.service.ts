import { Injectable } from '@nestjs/common';
import { JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class OfferExclusionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Beauticians who were offered and did not accept for this booking
   * (explicit DECLINED, or timed out / expired / cancelled before accepting).
   * Re-offering them is pointless — treat like a decline so the booking can
   * exhaust with OFFERS_NOT_ACCEPTED instead of looping forever.
   */
  async getNotAcceptedBeauticianIds(bookingId: string): Promise<string[]> {
    const offers = await this.prisma.jobOffer.findMany({
      where: {
        bookingId,
        status: {
          in: [
            JobOfferStatus.DECLINED,
            JobOfferStatus.EXPIRED,
            JobOfferStatus.TIMED_OUT,
            JobOfferStatus.CANCELLED,
          ],
        },
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
            JobOfferStatus.EXPIRED,
            JobOfferStatus.TIMED_OUT,
            JobOfferStatus.CANCELLED,
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
      // Any terminal outcome (accepted, declined, expired, timed out,
      // cancelled) permanently excludes this beautician from further offers
      // on the same booking — matching must try someone else.
      if (offer.status !== JobOfferStatus.OFFERED) {
        excluded.add(offer.beauticianUserId);
        continue;
      }

      // A still-live offer also excludes the beautician (already offered,
      // waiting for a response) so they never get a competing concurrent offer.
      if (offer.expiresAt > now) {
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
