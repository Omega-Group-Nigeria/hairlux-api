import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { HOME_SERVICE_MATCHING_QUEUE } from '../../home-service-booking/home-service-matching-queue.constants';
import { MatchingOrchestratorService } from '../../matching/services/matching-orchestrator.service';
import { OfferManagerService } from '../../matching/services/offer-manager.service';
import { DispatchStateService } from '../../matching/services/dispatch-state.service';
import { DISPATCH_EVENT_TYPES } from '../../matching/constants/dispatch-event.constants';

@Injectable()
export class JobDeclineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingOrchestrator: MatchingOrchestratorService,
    private readonly offerManager: OfferManagerService,
    private readonly dispatchState: DispatchStateService,
    @InjectQueue(HOME_SERVICE_MATCHING_QUEUE)
    private readonly matchingQueue: Queue,
  ) {}

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
        declineReason: reason ?? null,
      },
    });

    await this.offerManager.releaseBeauticianToOnline(beauticianUserId);

    const expiryJob = await this.matchingQueue.getJob(`expire-offer:${offer.id}`);
    if (expiryJob) {
      await expiryJob.remove();
    }

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.OFFER_DECLINED,
      {
        offerId: offer.id,
        beauticianUserId,
        reason: reason ?? null,
        tier: offer.tier,
      },
      `decline:${offer.id}`,
    );

    const matchingAttempt = offer.tier ?? undefined;
    void this.matchingOrchestrator.continueMatching(
      bookingId,
      matchingAttempt ?? undefined,
    );

    return {
      bookingId,
      status: JobOfferStatus.DECLINED,
      reason: reason ?? null,
    };
  }
}