import { Injectable, NotFoundException } from '@nestjs/common';
import { JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JobDeclineService {
  constructor(private readonly prisma: PrismaService) {}

  async decline(
    bookingId: string,
    beauticianUserId: string,
    reason?: string,
  ) {
    const offer = await this.prisma.jobOffer.findFirst({
      where: {
        bookingId,
        beauticianUserId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { gt: new Date() },
      },
    });

    if (!offer) {
      throw new NotFoundException('Job offer not found or expired');
    }

    await this.prisma.jobOffer.update({
      where: { id: offer.id },
      data: {
        status: JobOfferStatus.DECLINED,
        respondedAt: new Date(),
      },
    });

    return {
      bookingId,
      status: JobOfferStatus.DECLINED,
      reason: reason ?? null,
    };
  }
}