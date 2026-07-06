import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PendingBookingMatcherService } from '../matching/services/pending-booking-matcher.service';
import { MatchingOrchestratorService } from '../matching/services/matching-orchestrator.service';
import { BeauticianLocationIndexService } from '../matching/services/beautician-location-index.service';

@Injectable()
export class BeauticianAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pendingBookingMatcher: PendingBookingMatcherService,
    private readonly matchingOrchestrator: MatchingOrchestratorService,
    private readonly locationIndex: BeauticianLocationIndexService,
  ) {}

  async updateAvailability(
    userId: string,
    status: AvailabilityStatus,
  ) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });

    if (!profile) {
      throw new ForbiddenException('Beautician profile not found');
    }

    if (profile.dispatchSuspended && status === AvailabilityStatus.ONLINE) {
      throw new BadRequestException(
        'You are suspended from dispatch matching. Contact support.',
      );
    }

    const isFullyVerified =
      profile.isActive &&
      profile.kycStatus === KycStatus.VERIFIED &&
      profile.profileStatus === ProfileReviewStatus.APPROVED;

    if (!isFullyVerified) {
      throw new ForbiddenException(
        'You must be fully verified before changing availability',
      );
    }

    if (
      profile.availabilityStatus === AvailabilityStatus.ON_JOB &&
      status === AvailabilityStatus.ONLINE
    ) {
      throw new BadRequestException(
        'Cannot go online while on an active job. Complete the job first.',
      );
    }

    if (
      profile.availabilityStatus === AvailabilityStatus.OFFERED &&
      status === AvailabilityStatus.ONLINE
    ) {
      throw new BadRequestException(
        'Respond to your pending job offer before going online.',
      );
    }

    if (status === AvailabilityStatus.OFFLINE) {
      await this.matchingOrchestrator.cancelBeauticianPendingOffers(userId);
      await this.locationIndex.remove(userId);
    }

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: { availabilityStatus: status },
      select: {
        availabilityStatus: true,
        updatedAt: true,
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
      },
    });

    if (status === AvailabilityStatus.ONLINE) {
      if (updated.currentLat != null && updated.currentLng != null) {
        await this.locationIndex.upsertOnline({
          userId,
          lat: Number(updated.currentLat),
          lng: Number(updated.currentLng),
          serviceIds: profile.assignedServices.map((item) => item.serviceId),
          updatedAt: updated.lastLocationUpdate ?? updated.updatedAt,
        });
      }

      void this.pendingBookingMatcher.onBeauticianAvailable(userId, 'ONLINE');
    }

    if (status === AvailabilityStatus.ON_JOB) {
      await this.locationIndex.remove(userId);
    }

    return {
      availabilityStatus: updated.availabilityStatus,
      updatedAt: updated.updatedAt,
    };
  }
}