import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingCommsCloseReason,
  Booking,
  BookingStatus,
  PaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueryBookingsDto } from '../dto/query-bookings.dto';
import { RescheduleBookingDto } from '../dto/reschedule-booking.dto';
import {
  bookingUserReadInclude,
  formatBookingResponse,
  normalizeBookingServices,
} from '../utils/booking.utils';
import { bookingNeedsBeauticianAssignment } from '../../beautician/matching/utils/booking-assignment.utils';
import { NoShowPenaltyService } from '../../beautician/services/no-show-penalty.service';
import { MatchingOrchestratorService } from '../../beautician/matching/services/matching-orchestrator.service';
import { CommsSessionService } from '../../comms/services/comms-session.service';
import { CommsPresenterService } from '../../comms/services/comms-presenter.service';
import { CommsRealtimeService } from '../../comms/services/comms-realtime.service';
import { BookingPushNotifier } from '../../notifications/booking/booking-push.notifier';
import { BookingCancellationPolicyService } from './booking-cancellation-policy.service';
import { BookingParticipantService } from '../../beautician/home-service-booking/services/booking-participant.service';

@Injectable()
export class BookingCoreService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private readonly noShowPenaltyService: NoShowPenaltyService,
    private readonly matchingOrchestrator: MatchingOrchestratorService,
    private readonly commsSessionService: CommsSessionService,
    private readonly commsPresenter: CommsPresenterService,
    private readonly commsRealtime: CommsRealtimeService,
    private readonly bookingPushNotifier: BookingPushNotifier,
    private readonly cancellationPolicyService: BookingCancellationPolicyService,
    private readonly bookingParticipantService: BookingParticipantService,
  ) {}

  async getCancellationPolicy() {
    return this.cancellationPolicyService.getCustomerPolicies();
  }

  async getCancellationEligibility(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    return this.cancellationPolicyService.getCustomerEligibility(booking);
  }

  async findUserBookings(userId: string, queryDto: QueryBookingsDto) {
    const { status, startDate, endDate } = queryDto;

    const where: {
      userId: string;
      status?: BookingStatus;
      bookingDate?: { gte?: Date; lte?: Date };
    } = { userId };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.bookingDate = {};
      if (startDate) {
        where.bookingDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.bookingDate.lte = new Date(endDate);
      }
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: bookingUserReadInclude,
      orderBy: {
        bookingDate: 'desc',
      },
    });

    return Promise.all(
      bookings.map((booking) =>
        this.withCustomerCancellationEligibility(booking),
      ),
    );
  }

  private async withCustomerCancellationEligibility(booking: Booking) {
    const cancellationEligibility =
      await this.cancellationPolicyService.getCustomerEligibility(booking);

    return {
      ...formatBookingResponse(booking),
      cancellationEligibility,
    };
  }

  async findOne(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        ...bookingUserReadInclude,
        commsSession: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    return {
      ...(await this.withCustomerCancellationEligibility(booking)),
      comms: this.commsPresenter.embedForBooking(booking),
    };
  }

  async reschedule(
    id: string,
    userId: string,
    rescheduleDto: RescheduleBookingDto,
  ) {
    const { date, time, reason } = rescheduleDto;

    const booking = await this.prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    if (
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot reschedule completed or cancelled bookings',
      );
    }

    const newBookingDate = new Date(`${date}T${time}`);

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        bookingDate: newBookingDate,
        bookingTime: time,
        notes: reason ? `Rescheduled: ${reason}` : booking.notes,
      },
      include: bookingUserReadInclude,
    });

    // Re-schedule dispatch for home-service bookings still awaiting assignment.
    if (booking.status === BookingStatus.PENDING_ASSIGNMENT) {
      const serviceRecords = normalizeBookingServices(booking.services);
      if (
        bookingNeedsBeauticianAssignment(booking.bookingType, serviceRecords)
      ) {
        await this.matchingOrchestrator.rescheduleDispatchForBooking(
          id,
          newBookingDate,
        );
      }
    }

    return formatBookingResponse(updatedBooking);
  }

  async updateStatus(
    id: string,
    userId: string,
    status: BookingStatus,
    reason?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    if (status !== BookingStatus.CANCELLED) {
      throw new ForbiddenException('Users can only cancel bookings');
    }

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed bookings');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    const evaluation = await this.cancellationPolicyService.evaluateCancellation({
      booking,
      actor: 'customer',
      reason,
    });

    if (!evaluation.allowed) {
      throw new ForbiddenException(
        evaluation.denialReason ?? 'Cancellation is not allowed for this booking',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id },
        data: {
          status,
          cancelReason: reason,
        },
        include: bookingUserReadInclude,
      });

      await this.cancellationPolicyService.processRefund(
        tx,
        booking,
        evaluation,
      );

      return updatedBooking;
    });

    const shouldInvalidateWallet =
      evaluation.refundAmount > 0 &&
      (booking.paymentMethod === PaymentMethod.WALLET ||
        booking.paymentMethod === PaymentMethod.MONNIFY);

    void Promise.all([
      this.redis.delByPattern('analytics:*'),
      ...(shouldInvalidateWallet
        ? [this.redis.del(`wallet:balance:${userId}`)]
        : []),
      this.noShowPenaltyService.recordIfApplicable(id),
      this.matchingOrchestrator.cancelDispatchForBooking(id),
      ...(booking.assignedBeauticianUserId
        ? [
            this.bookingParticipantService.releaseBeauticianIfIdle(
              booking.assignedBeauticianUserId,
            ),
          ]
        : []),
    ]);

    if (booking.assignedBeauticianUserId) {
      await this.commsSessionService.closeForBookingSafely(
        id,
        BookingCommsCloseReason.CANCELLED,
      );

      await this.commsRealtime.emitBookingStatus(id, BookingStatus.CANCELLED);
    }

    this.bookingPushNotifier.notifyCancelled({
      customerUserId: booking.userId,
      bookingId: id,
      reservationCode: booking.reservationCode,
      assignedBeauticianUserId: booking.assignedBeauticianUserId,
    });

    return {
      ...formatBookingResponse(result),
      cancellation: {
        scenario: evaluation.scenario,
        refundPercent: evaluation.refundPercent,
        forfeiturePercent: evaluation.forfeiturePercent,
        refundAmount: evaluation.refundAmount,
        forfeitureAmount: evaluation.forfeitureAmount,
      },
    };
  }
}
