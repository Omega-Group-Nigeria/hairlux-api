import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityStatus,
  BookingStatus,
  DispatchStatus,
  JobOfferStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeBookingServices } from '../../../booking/utils/booking.utils';
import { extractHomeServiceIds } from '../utils/booking-assignment.utils';
import { DispatchStateService } from './dispatch-state.service';
import { MatchingOrchestratorService } from './matching-orchestrator.service';
import { BeauticianLocationIndexService } from './beautician-location-index.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { DISPATCH_EVENT_TYPES } from '../constants/dispatch-event.constants';
import { CommsSessionService } from '../../../comms/services/comms-session.service';
import { CommsRealtimeService } from '../../../comms/services/comms-realtime.service';
import { EarningsCalculatorService } from '../../payout/services/earnings-calculator.service';
import { ServiceCommissionRateService } from '../../payout/services/service-commission-rate.service';

@Injectable()
export class DispatchAdminService {
  private readonly logger = new Logger(DispatchAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchState: DispatchStateService,
    private readonly matchingOrchestrator: MatchingOrchestratorService,
    private readonly locationIndex: BeauticianLocationIndexService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly earningsCalculator: EarningsCalculatorService,
    private readonly serviceCommissionRates: ServiceCommissionRateService,
    private readonly commsRealtime: CommsRealtimeService,
    private readonly commsSessionService: CommsSessionService,
  ) {}

  async forceAssign(
    bookingId: string,
    beauticianUserId: string,
    adminUserId: string,
  ) {
    const existing = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        assignedBeauticianUserId: beauticianUserId,
        status: BookingStatus.ASSIGNED,
      },
      select: { id: true, assignedBeauticianUserId: true },
    });

    if (existing) {
      return {
        bookingId: existing.id,
        beauticianUserId: existing.assignedBeauticianUserId,
        message: 'Booking is already assigned to this beautician.',
      };
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        services: true,
        bookingType: true,
        totalAmount: true,
        dispatchStatus: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.PENDING_ASSIGNMENT) {
      throw new BadRequestException(
        'Force assign is only allowed for bookings awaiting beautician assignment',
      );
    }

    const requiredServiceIds = extractHomeServiceIds(
      normalizeBookingServices(booking.services),
    );

    if (!requiredServiceIds.length) {
      throw new BadRequestException('Booking has no home service items');
    }

    const beautician = await this.prisma.beauticianProfile.findUnique({
      where: { userId: beauticianUserId },
      include: {
        assignedServices: { select: { serviceId: true } },
      },
    });

    if (!beautician) {
      throw new NotFoundException('Beautician profile not found');
    }

    this.assertBeauticianEligibleForForceAssign(beautician, requiredServiceIds);

    const pendingOffer = await this.prisma.jobOffer.findFirst({
      where: {
        beauticianUserId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { gt: new Date() },
        bookingId: { not: bookingId },
      },
      select: { id: true, bookingId: true },
    });

    if (pendingOffer) {
      throw new BadRequestException(
        'Beautician has another pending job offer. Resolve it before force assign.',
      );
    }

    // Force-assign requires the beautician to be ONLINE first. Auto-promote OFFLINE
    // only after pre-flight checks so we never leave a partial ONLINE update.
    let broughtOnlineFromOffline = false;
    if (beautician.availabilityStatus === AvailabilityStatus.OFFLINE) {
      await this.prisma.beauticianProfile.update({
        where: { userId: beauticianUserId },
        data: { availabilityStatus: AvailabilityStatus.ONLINE },
      });
      beautician.availabilityStatus = AvailabilityStatus.ONLINE;
      broughtOnlineFromOffline = true;
      this.logger.log(
        `Beautician ${beauticianUserId} set ONLINE before force-assign of booking ${bookingId}`,
      );
    }

    await this.matchingOrchestrator.clearActiveOffersAndJobs(bookingId);

    const settings = await this.settingsService.getSettings();
    const services = normalizeBookingServices(booking.services);
    const homeServiceIds = extractHomeServiceIds(services);
    const serviceCommissionRates =
      await this.serviceCommissionRates.getRateMapForServiceIds(homeServiceIds);
    const earnings = this.earningsCalculator.calculate({
      bookingType: booking.bookingType,
      services: booking.services,
      totalAmount: Number(booking.totalAmount),
      defaultCommissionRate: Number(settings.commissionRate),
      serviceCommissionRates,
    });
    const estEarnings = earnings.earningsAmount;
    const now = new Date();

    const offer = await this.prisma.$transaction(async (tx) => {
      await tx.jobOffer.updateMany({
        where: {
          bookingId,
          status: JobOfferStatus.OFFERED,
        },
        data: {
          status: JobOfferStatus.CANCELLED,
          respondedAt: now,
        },
      });

      const createdOffer = await tx.jobOffer.create({
        data: {
          bookingId,
          beauticianUserId,
          status: JobOfferStatus.ACCEPTED,
          offeredAt: now,
          respondedAt: now,
          expiresAt: now,
          tier: null,
          estEarningsAtOffer: estEarnings,
          scoreSnapshot: { source: 'admin_force_assign' },
        },
      });

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.ASSIGNED,
          assignedBeauticianUserId: beauticianUserId,
          dispatchStatus: DispatchStatus.ASSIGNED,
          matchingExhaustedAt: null,
          matchingExhaustedReason: null,
        },
      });

      await tx.beauticianProfile.update({
        where: { userId: beauticianUserId },
        data: { availabilityStatus: AvailabilityStatus.ON_JOB },
      });

      return createdOffer;
    });

    await this.dispatchState.recordEvent(
      bookingId,
      DISPATCH_EVENT_TYPES.FORCE_ASSIGNED,
      {
        beauticianUserId,
        adminUserId,
        offerId: offer.id,
        previousDispatchStatus: booking.dispatchStatus,
        broughtOnlineFromOffline,
      },
      `force-assign:${bookingId}:${beauticianUserId}`,
    );

    await this.locationIndex.remove(beauticianUserId);

    await this.commsSessionService.openForBookingSafely(bookingId);

    await this.commsRealtime.emitBookingStatus(
      bookingId,
      BookingStatus.ASSIGNED,
      {
        assignedBeauticianUserId: beauticianUserId,
      },
    );

    this.logger.warn(
      `Booking ${bookingId} force-assigned to beautician ${beauticianUserId} by admin ${adminUserId}`,
    );

    return {
      bookingId,
      beauticianUserId,
      offerId: offer.id,
      broughtOnlineFromOffline,
      message: broughtOnlineFromOffline
        ? 'Beautician was OFFLINE, set to ONLINE, then force-assigned to the booking.'
        : 'Booking has been force-assigned to the beautician.',
    };
  }

  async updateDispatchSuspension(profileId: string, suspended: boolean) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        dispatchSuspended: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }

    if (profile.dispatchSuspended === suspended) {
      return {
        profileId: profile.id,
        userId: profile.userId,
        dispatchSuspended: suspended,
        message: suspended
          ? 'Beautician is already suspended from dispatch.'
          : 'Beautician is already eligible for dispatch.',
      };
    }

    const updated = await this.prisma.beauticianProfile.update({
      where: { id: profileId },
      data: { dispatchSuspended: suspended },
      select: {
        id: true,
        userId: true,
        dispatchSuspended: true,
        availabilityStatus: true,
      },
    });

    if (suspended) {
      await this.locationIndex.remove(profile.userId);
      await this.matchingOrchestrator.cancelBeauticianPendingOffers(
        profile.userId,
      );
    }

    this.logger.log(
      `Beautician ${profile.userId} dispatch suspension set to ${suspended}`,
    );

    return {
      profileId: updated.id,
      userId: updated.userId,
      dispatchSuspended: updated.dispatchSuspended,
      availabilityStatus: updated.availabilityStatus,
      message: suspended
        ? 'Beautician suspended from dispatch matching.'
        : 'Beautician re-enabled for dispatch matching.',
    };
  }

  private assertBeauticianEligibleForForceAssign(
    beautician: {
      isActive: boolean;
      dispatchSuspended: boolean;
      kycStatus: KycStatus;
      profileStatus: ProfileReviewStatus;
      availabilityStatus: AvailabilityStatus;
      assignedServices: Array<{ serviceId: string }>;
    },
    requiredServiceIds: string[],
  ) {
    if (!beautician.isActive) {
      throw new BadRequestException('Beautician account is not active');
    }

    if (beautician.dispatchSuspended) {
      throw new BadRequestException(
        'Beautician is suspended from dispatch matching',
      );
    }

    if (beautician.kycStatus !== KycStatus.VERIFIED) {
      throw new BadRequestException('Beautician KYC is not verified');
    }

    if (beautician.profileStatus !== ProfileReviewStatus.APPROVED) {
      throw new BadRequestException('Beautician profile is not approved');
    }

    if (beautician.availabilityStatus === AvailabilityStatus.ON_JOB) {
      throw new BadRequestException(
        'Beautician is already on an active job',
      );
    }

    const assignedServiceIds = new Set(
      beautician.assignedServices.map((item) => item.serviceId),
    );

    if (
      !requiredServiceIds.every((serviceId) => assignedServiceIds.has(serviceId))
    ) {
      throw new BadRequestException(
        'Beautician is not assigned all services required by this booking',
      );
    }
  }
}