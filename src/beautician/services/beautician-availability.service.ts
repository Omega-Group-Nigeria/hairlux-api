import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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

type AvailabilityProfile = {
  userId: string;
  isActive: boolean;
  kycStatus: KycStatus;
  profileStatus: ProfileReviewStatus;
  dispatchSuspended: boolean;
  availabilityStatus: AvailabilityStatus;
  assignedServices: Array<{ serviceId: string }>;
};

@Injectable()
export class BeauticianAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pendingBookingMatcher: PendingBookingMatcherService,
    private readonly matchingOrchestrator: MatchingOrchestratorService,
    private readonly locationIndex: BeauticianLocationIndexService,
  ) {}

  async updateAvailability(userId: string, status: AvailabilityStatus) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });

    if (!profile) {
      throw new ForbiddenException('Beautician profile not found');
    }

    this.assertSelfServiceMayChangeAvailability(profile, status);

    return this.applyAvailabilityChange(profile, status);
  }

  /**
   * Admin force-set of ONLINE/OFFLINE by beautician profile id.
   * Bypasses full-verification self-service checks; still blocks unsafe ONLINE transitions.
   */
  async adminUpdateAvailability(
    profileId: string,
    status: AvailabilityStatus,
  ) {
    if (
      status !== AvailabilityStatus.ONLINE &&
      status !== AvailabilityStatus.OFFLINE
    ) {
      throw new BadRequestException(
        'Admin may only set availability to ONLINE or OFFLINE',
      );
    }

    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }

    if (profile.availabilityStatus === status) {
      return {
        profileId,
        userId: profile.userId,
        availabilityStatus: profile.availabilityStatus,
        updatedAt: profile.updatedAt,
        message: `Beautician is already ${status}.`,
      };
    }

    this.assertAdminMayChangeAvailability(profile, status);

    const result = await this.applyAvailabilityChange(profile, status);

    return {
      profileId,
      userId: profile.userId,
      ...result,
      message:
        status === AvailabilityStatus.ONLINE
          ? 'Beautician set to ONLINE.'
          : 'Beautician set to OFFLINE.',
    };
  }

  private assertSelfServiceMayChangeAvailability(
    profile: AvailabilityProfile,
    status: AvailabilityStatus,
  ) {
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

    this.assertSafeOnlineTransition(profile, status, {
      onJobMessage:
        'Cannot go online while on an active job. Complete the job first.',
      offeredMessage:
        'Respond to your pending job offer before going online.',
    });
  }

  private assertAdminMayChangeAvailability(
    profile: AvailabilityProfile,
    status: AvailabilityStatus,
  ) {
    if (profile.dispatchSuspended && status === AvailabilityStatus.ONLINE) {
      throw new BadRequestException(
        'Beautician is suspended from dispatch matching. Re-enable dispatch first.',
      );
    }

    if (!profile.isActive && status === AvailabilityStatus.ONLINE) {
      throw new BadRequestException(
        'Cannot set an inactive beautician to ONLINE.',
      );
    }

    this.assertSafeOnlineTransition(profile, status, {
      onJobMessage:
        'Cannot set ONLINE while beautician is on an active job. Complete the job first.',
      offeredMessage:
        'Cannot set ONLINE while beautician has a pending job offer.',
    });
  }

  private assertSafeOnlineTransition(
    profile: AvailabilityProfile,
    status: AvailabilityStatus,
    messages: { onJobMessage: string; offeredMessage: string },
  ) {
    if (status !== AvailabilityStatus.ONLINE) {
      return;
    }

    if (profile.availabilityStatus === AvailabilityStatus.ON_JOB) {
      throw new BadRequestException(messages.onJobMessage);
    }

    if (profile.availabilityStatus === AvailabilityStatus.OFFERED) {
      throw new BadRequestException(messages.offeredMessage);
    }
  }

  private async applyAvailabilityChange(
    profile: AvailabilityProfile,
    status: AvailabilityStatus,
  ) {
    const { userId } = profile;

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