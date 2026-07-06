import { Injectable } from '@nestjs/common';
import { JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MatchingConfigService } from './matching-config.service';

@Injectable()
export class OfferExclusionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingConfig: MatchingConfigService,
  ) {}

  async getExcludedBeauticianIds(bookingId: string): Promise<string[]> {
    const offers = await this.prisma.jobOffer.findMany({
      where: {
        bookingId,
        status: {
          in: [
            JobOfferStatus.DECLINED,
            JobOfferStatus.OFFERED,
            JobOfferStatus.ACCEPTED,
            JobOfferStatus.EXPIRED,
            JobOfferStatus.CANCELLED,
            JobOfferStatus.TIMED_OUT,
          ],
        },
      },
      select: {
        beauticianUserId: true,
        status: true,
        expiresAt: true,
        respondedAt: true,
      },
    });

    const now = new Date();
    const cooldownSeconds = this.matchingConfig.getRejectionCooldownSeconds();
    const excluded = new Set<string>();

    for (const offer of offers) {
      if (offer.status === JobOfferStatus.DECLINED) {
        if (
          offer.respondedAt &&
          now.getTime() - offer.respondedAt.getTime() <
            cooldownSeconds * 1000
        ) {
          excluded.add(offer.beauticianUserId);
        }
        continue;
      }

      if (
        offer.status === JobOfferStatus.EXPIRED ||
        offer.status === JobOfferStatus.CANCELLED ||
        offer.status === JobOfferStatus.TIMED_OUT ||
        offer.status === JobOfferStatus.ACCEPTED
      ) {
        excluded.add(offer.beauticianUserId);
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
}