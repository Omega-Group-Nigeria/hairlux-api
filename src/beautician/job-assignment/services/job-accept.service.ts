import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityStatus,
  BookingStatus,
  JobOfferStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatBookingAddress } from '../../../booking/utils/booking.utils';
import { AssignmentLockService } from './assignment-lock.service';
import { JobPresentationService } from './job-presentation.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';

@Injectable()
export class JobAcceptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: AssignmentLockService,
    private readonly presentationService: JobPresentationService,
    private readonly realtimePublisher: RealtimePublisherService,
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
      return this.presentationService.buildAcceptedResponse(existingAssignment);
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
        const assigned = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.ASSIGNED,
            assignedBeauticianUserId: beauticianUserId,
          },
          include: this.presentationService.bookingInclude(),
        });

        await tx.jobOffer.update({
          where: { id: offer.id },
          data: {
            status: JobOfferStatus.ACCEPTED,
            respondedAt: now,
          },
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

      this.realtimePublisher.emitBookingStatus(bookingId, BookingStatus.ASSIGNED, {
        assignedBeauticianUserId: beauticianUserId,
      });

      return this.presentationService.buildAcceptedResponse(updatedBooking);
    } finally {
      await this.lockService.release(bookingId);
    }
  }
}