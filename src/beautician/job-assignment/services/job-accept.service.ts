import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityStatus,
  BookingStatus,
  DispatchStatus,
  JobOfferStatus,
} from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { HOME_SERVICE_MATCHING_QUEUE } from '../../home-service-booking/home-service-booking.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AssignmentLockService } from './assignment-lock.service';
import { JobPresentationService } from './job-presentation.service';
import { JobEarningsResolverService } from './job-earnings-resolver.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { CommsRealtimeService } from '../../../comms/services/comms-realtime.service';
import { DispatchStateService } from '../../matching/services/dispatch-state.service';
import { DISPATCH_EVENT_TYPES } from '../../matching/constants/dispatch-event.constants';
import { BeauticianLocationIndexService } from '../../matching/services/beautician-location-index.service';
import { CommsSessionService } from '../../../comms/services/comms-session.service';

@Injectable()
export class JobAcceptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: AssignmentLockService,
    private readonly presentationService: JobPresentationService,
    private readonly earningsResolver: JobEarningsResolverService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly commsRealtime: CommsRealtimeService,
    private readonly dispatchState: DispatchStateService,
    private readonly locationIndex: BeauticianLocationIndexService,
    private readonly commsSessionService: CommsSessionService,
    @InjectQueue(HOME_SERVICE_MATCHING_QUEUE)
    private readonly matchingQueue: Queue,
  ) {}

  async accept(bookingId: string, beauticianUserId: string) {
    const existingAssignment = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        assignedBeauticianUserId: beauticianUserId,
        status: BookingStatus.ASSIGNED,
      },
      include: this.presentationService.bookingInclude(),
    });

    if (existingAssignment) {
      const earningsByBookingId =
        await this.earningsResolver.resolveForActiveBookings(
          beauticianUserId,
          [existingAssignment],
        );

      return this.presentationService.buildAcceptedResponse(
        existingAssignment,
        earningsByBookingId.get(existingAssignment.id),
      );
    }

    const lockAcquired = await this.lockService.acquire(
      bookingId,
      beauticianUserId,
    );
    if (!lockAcquired) {
      throw new ConflictException(
        'Another beautician is accepting this job. Please try another offer.',
      );
    }

    try {
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

      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking || booking.status !== BookingStatus.PENDING_ASSIGNMENT) {
        throw new BadRequestException('This job is no longer available');
      }

      const now = new Date();

      const updatedBooking = await this.prisma.$transaction(async (tx) => {
        const acceptedOffer = await tx.jobOffer.updateMany({
          where: {
            id: offer.id,
            status: JobOfferStatus.OFFERED,
            expiresAt: { gt: now },
          },
          data: {
            status: JobOfferStatus.ACCEPTED,
            respondedAt: now,
          },
        });

        if (acceptedOffer.count === 0) {
          throw new ConflictException(
            'This job offer is no longer available',
          );
        }

        const assigned = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.ASSIGNED,
            assignedBeauticianUserId: beauticianUserId,
            dispatchStatus: DispatchStatus.ASSIGNED,
          },
          include: this.presentationService.bookingInclude(),
        });

        await tx.jobOffer.updateMany({
          where: {
            bookingId,
            id: { not: offer.id },
            status: JobOfferStatus.OFFERED,
          },
          data: {
            status: JobOfferStatus.EXPIRED,
            respondedAt: now,
          },
        });

        await tx.beauticianProfile.update({
          where: { userId: beauticianUserId },
          data: { availabilityStatus: AvailabilityStatus.ON_JOB },
        });

        return assigned;
      });

      const expiryJob = await this.matchingQueue.getJob(`expire-offer:${offer.id}`);
      if (expiryJob) {
        await expiryJob.remove();
      }

      await this.dispatchState.recordEvent(
        bookingId,
        DISPATCH_EVENT_TYPES.OFFER_ACCEPTED,
        {
          offerId: offer.id,
          beauticianUserId,
          tier: offer.tier,
        },
        `accept:${offer.id}`,
      );

      await this.locationIndex.remove(beauticianUserId);

      await this.commsSessionService.openForBookingSafely(bookingId);

      const bookingForResponse = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: this.presentationService.bookingInclude(),
      });

      if (!bookingForResponse) {
        throw new NotFoundException('Booking not found');
      }

      await this.commsRealtime.emitBookingStatus(
        bookingId,
        BookingStatus.ASSIGNED,
        {
          assignedBeauticianUserId: beauticianUserId,
        },
      );

      const [settings, profile] = await Promise.all([
        this.settingsService.getSettings(),
        this.prisma.beauticianProfile.findUnique({
          where: { userId: beauticianUserId },
          select: { commissionRateOverride: true },
        }),
      ]);

      const earnings = this.earningsResolver.resolveFromOfferSnapshot(
        updatedBooking,
        {
          estEarningsAtOffer: offer.estEarningsAtOffer,
          commissionRate: settings.commissionRate,
          commissionRateOverride: profile?.commissionRateOverride
            ? Number(profile.commissionRateOverride)
            : null,
        },
      );

      return this.presentationService.buildAcceptedResponse(
        bookingForResponse,
        earnings,
      );
    } finally {
      await this.lockService.release(bookingId);
    }
  }
}