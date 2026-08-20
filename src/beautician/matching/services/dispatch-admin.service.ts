import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  AvailabilityStatus,
  BookingStatus,
  DispatchStatus,
  JobOfferStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../../mail/mail.service';
import { normalizeBookingServices } from '../../../booking/utils/booking.utils';
import { extractHomeServiceIds } from '../utils/booking-assignment.utils';
import { DispatchStateService } from './dispatch-state.service';
import { MatchingOrchestratorService } from './matching-orchestrator.service';
import { BeauticianLocationIndexService } from './beautician-location-index.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { DISPATCH_EVENT_TYPES } from '../constants/dispatch-event.constants';
import {
  DISPATCH_PROBATION_JOB,
  DISPATCH_PROBATION_QUEUE,
  dispatchProbationJobId,
  type DispatchProbationJobData,
} from '../constants/dispatch-probation.constants';
import { CommsSessionService } from '../../../comms/services/comms-session.service';
import { CommsRealtimeService } from '../../../comms/services/comms-realtime.service';
import { EarningsCalculatorService } from '../../payout/services/earnings-calculator.service';
import { ServiceCommissionRateService } from '../../payout/services/service-commission-rate.service';
import { BeauticianCommissionRateService } from '../../payout/services/beautician-commission-rate.service';
import type { UpdateBeauticianDispatchDto } from '../dto/update-beautician-dispatch.dto';

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
    private readonly beauticianCommissionRates: BeauticianCommissionRateService,
    private readonly commsRealtime: CommsRealtimeService,
    private readonly commsSessionService: CommsSessionService,
    private readonly mailService: MailService,
    @InjectQueue(DISPATCH_PROBATION_QUEUE)
    private readonly probationQueue: Queue<DispatchProbationJobData>,
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
    const beauticianRateMap =
      await this.beauticianCommissionRates.getRateMapForBeauticianIds([
        beauticianUserId,
      ]);
    const earnings = this.earningsCalculator.calculate({
      bookingType: booking.bookingType,
      services: booking.services,
      totalAmount: Number(booking.totalAmount),
      defaultCommissionRate: Number(settings.commissionRate),
      serviceCommissionRates,
      beauticianCommissionRate: beauticianRateMap.get(beauticianUserId),
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

  /**
   * Soft-suspend / re-enable for dispatch matching.
   * Optional timed probation via `until` or `durationHours` auto-lifts suspension.
   */
  async updateDispatchSuspension(
    profileId: string,
    dto: UpdateBeauticianDispatchDto,
  ) {
    const { suspended } = dto;
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        dispatchSuspended: true,
        dispatchSuspendedUntil: true,
        dispatchSuspensionReason: true,
        user: {
          select: {
            email: true,
            firstName: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }

    if (!suspended) {
      return this.reinstateDispatch(profile, { automatic: false });
    }

    const suspendedUntil = this.resolveSuspendedUntil(dto);
    const reason =
      dto.reason?.trim() ||
      (profile.dispatchSuspended ? profile.dispatchSuspensionReason : null);

    const alreadySame =
      profile.dispatchSuspended &&
      this.sameInstant(profile.dispatchSuspendedUntil, suspendedUntil) &&
      (reason ?? null) === (profile.dispatchSuspensionReason ?? null);

    if (alreadySame) {
      return {
        profileId: profile.id,
        userId: profile.userId,
        dispatchSuspended: true,
        dispatchSuspendedUntil: profile.dispatchSuspendedUntil,
        dispatchSuspensionReason: profile.dispatchSuspensionReason,
        message: suspendedUntil
          ? 'Beautician is already on the same timed dispatch probation.'
          : 'Beautician is already suspended from dispatch.',
      };
    }

    const updated = await this.prisma.beauticianProfile.update({
      where: { id: profileId },
      data: {
        dispatchSuspended: true,
        dispatchSuspendedUntil: suspendedUntil,
        dispatchSuspensionReason: reason,
      },
      select: {
        id: true,
        userId: true,
        dispatchSuspended: true,
        dispatchSuspendedUntil: true,
        dispatchSuspensionReason: true,
        availabilityStatus: true,
      },
    });

    await this.locationIndex.remove(profile.userId);
    await this.matchingOrchestrator.cancelBeauticianPendingOffers(
      profile.userId,
    );

    if (suspendedUntil) {
      await this.scheduleProbationLift(
        profile.id,
        profile.userId,
        suspendedUntil,
      );
    } else {
      await this.cancelProbationJob(profile.id);
    }

    await this.mailService.sendBeauticianDispatchSuspensionEmail(
      profile.user.email,
      {
        firstName: profile.user.firstName,
        kind: 'SUSPENDED',
        reason: updated.dispatchSuspensionReason,
        suspendedUntil: updated.dispatchSuspendedUntil,
      },
    );

    this.logger.log(
      `Beautician ${profile.userId} dispatch suspended` +
        (suspendedUntil
          ? ` until ${suspendedUntil.toISOString()}`
          : ' (indefinite)'),
    );

    return {
      profileId: updated.id,
      userId: updated.userId,
      dispatchSuspended: updated.dispatchSuspended,
      dispatchSuspendedUntil: updated.dispatchSuspendedUntil,
      dispatchSuspensionReason: updated.dispatchSuspensionReason,
      availabilityStatus: updated.availabilityStatus,
      message: suspendedUntil
        ? `Beautician suspended from dispatch until ${suspendedUntil.toISOString()}.`
        : 'Beautician suspended from dispatch matching (indefinite).',
    };
  }

  /**
   * Called by delayed Bull job when timed probation ends.
   * No-ops if suspension was lifted early or extended past the job's until.
   */
  async liftDispatchSuspensionFromJob(data: DispatchProbationJobData) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: data.profileId },
      select: {
        id: true,
        userId: true,
        dispatchSuspended: true,
        dispatchSuspendedUntil: true,
        dispatchSuspensionReason: true,
        user: {
          select: {
            email: true,
            firstName: true,
          },
        },
      },
    });

    if (!profile) {
      this.logger.warn(
        `Dispatch probation job: profile ${data.profileId} not found`,
      );
      return { lifted: false, reason: 'profile_not_found' as const };
    }

    if (!profile.dispatchSuspended) {
      return { lifted: false, reason: 'already_eligible' as const };
    }

    const jobUntil = new Date(data.suspendedUntil);
    if (
      !profile.dispatchSuspendedUntil ||
      !this.sameInstant(profile.dispatchSuspendedUntil, jobUntil)
    ) {
      this.logger.log(
        `Ignoring stale dispatch probation job for ${profile.userId} (until mismatch)`,
      );
      return { lifted: false, reason: 'stale_job' as const };
    }

    // Allow a small clock skew; job may run a few ms early.
    const now = Date.now();
    if (profile.dispatchSuspendedUntil.getTime() > now + 5_000) {
      this.logger.warn(
        `Dispatch probation job fired early for ${profile.userId}; rescheduling`,
      );
      await this.scheduleProbationLift(
        profile.id,
        profile.userId,
        profile.dispatchSuspendedUntil,
      );
      return { lifted: false, reason: 'rescheduled' as const };
    }

    await this.reinstateDispatch(profile, { automatic: true });
    return { lifted: true as const };
  }

  private async reinstateDispatch(
    profile: {
      id: string;
      userId: string;
      dispatchSuspended: boolean;
      user: { email: string; firstName: string };
    },
    opts: { automatic: boolean },
  ) {
    if (!profile.dispatchSuspended) {
      await this.cancelProbationJob(profile.id);
      return {
        profileId: profile.id,
        userId: profile.userId,
        dispatchSuspended: false,
        dispatchSuspendedUntil: null as Date | null,
        dispatchSuspensionReason: null as string | null,
        message: 'Beautician is already eligible for dispatch.',
      };
    }

    const updated = await this.prisma.beauticianProfile.update({
      where: { id: profile.id },
      data: {
        dispatchSuspended: false,
        dispatchSuspendedUntil: null,
        dispatchSuspensionReason: null,
      },
      select: {
        id: true,
        userId: true,
        dispatchSuspended: true,
        dispatchSuspendedUntil: true,
        dispatchSuspensionReason: true,
        availabilityStatus: true,
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
        assignedServices: { select: { serviceId: true } },
      },
    });

    await this.cancelProbationJob(profile.id);

    // Re-enter the geo index on reinstate so an ONLINE beautician becomes
    // visible to dispatch matching again immediately.
    if (
      updated.availabilityStatus === AvailabilityStatus.ONLINE &&
      updated.currentLat != null &&
      updated.currentLng != null
    ) {
      await this.locationIndex.upsertOnline({
        userId: updated.userId,
        lat: Number(updated.currentLat),
        lng: Number(updated.currentLng),
        serviceIds: updated.assignedServices.map((s) => s.serviceId),
        updatedAt: updated.lastLocationUpdate ?? undefined,
      });
    }

    await this.mailService.sendBeauticianDispatchSuspensionEmail(
      profile.user.email,
      {
        firstName: profile.user.firstName,
        kind: 'REINSTATED',
        automatic: opts.automatic,
      },
    );

    this.logger.log(
      `Beautician ${profile.userId} dispatch reinstated` +
        (opts.automatic ? ' (auto probation end)' : ' (admin)'),
    );

    return {
      profileId: updated.id,
      userId: updated.userId,
      dispatchSuspended: updated.dispatchSuspended,
      dispatchSuspendedUntil: updated.dispatchSuspendedUntil,
      dispatchSuspensionReason: updated.dispatchSuspensionReason,
      availabilityStatus: updated.availabilityStatus,
      message: opts.automatic
        ? 'Timed probation ended; beautician re-enabled for dispatch matching.'
        : 'Beautician re-enabled for dispatch matching.',
    };
  }

  private resolveSuspendedUntil(dto: UpdateBeauticianDispatchDto): Date | null {
    if (dto.until && dto.durationHours != null) {
      throw new BadRequestException(
        'Provide either `until` or `durationHours`, not both',
      );
    }

    if (dto.until) {
      const until = new Date(dto.until);
      if (Number.isNaN(until.getTime())) {
        throw new BadRequestException('Invalid `until` datetime');
      }
      if (until.getTime() <= Date.now()) {
        throw new BadRequestException('`until` must be in the future');
      }
      return until;
    }

    if (dto.durationHours != null) {
      return new Date(Date.now() + dto.durationHours * 60 * 60 * 1000);
    }

    return null;
  }

  private sameInstant(
    a: Date | null | undefined,
    b: Date | null | undefined,
  ): boolean {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Math.abs(a.getTime() - b.getTime()) < 1000;
  }

  private async scheduleProbationLift(
    profileId: string,
    userId: string,
    until: Date,
  ): Promise<void> {
    const delayMs = Math.max(0, until.getTime() - Date.now());
    const jobId = dispatchProbationJobId(profileId);
    await this.cancelProbationJob(profileId);

    await this.probationQueue.add(
      DISPATCH_PROBATION_JOB,
      {
        profileId,
        userId,
        suspendedUntil: until.toISOString(),
      },
      {
        jobId,
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Scheduled dispatch probation lift for ${userId} in ${delayMs}ms (job ${jobId})`,
    );
  }

  private async cancelProbationJob(profileId: string): Promise<void> {
    const jobId = dispatchProbationJobId(profileId);
    try {
      const existing = await this.probationQueue.getJob(jobId);
      if (existing) {
        await existing.remove();
      }
    } catch (err) {
      this.logger.warn(
        `Could not remove probation job ${jobId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
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
      throw new BadRequestException('Beautician is already on an active job');
    }

    const assignedServiceIds = new Set(
      beautician.assignedServices.map((item) => item.serviceId),
    );

    if (
      !requiredServiceIds.every((serviceId) =>
        assignedServiceIds.has(serviceId),
      )
    ) {
      throw new BadRequestException(
        'Beautician is not assigned all services required by this booking',
      );
    }
  }
}
