import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingOrchestratorService } from '../../beautician/matching/services/matching-orchestrator.service';
import { DispatchAdminService } from '../../beautician/matching/services/dispatch-admin.service';
import { canRetryMatching } from '../../beautician/matching/utils/matching-radius.util';

@Injectable()
export class BookingMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingOrchestrator: MatchingOrchestratorService,
    private readonly dispatchAdmin: DispatchAdminService,
  ) {}

  async retryMatchingForUser(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      select: {
        id: true,
        status: true,
        matchingExhaustedAt: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (!canRetryMatching(booking)) {
      throw new BadRequestException(
        'Matching can only be retried after a previous search has been exhausted',
      );
    }

    return this.matchingOrchestrator.retryMatching(bookingId, 'customer');
  }

  async retryMatchingAdmin(bookingId: string, startAtTier = 1) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.PENDING_ASSIGNMENT) {
      throw new ForbiddenException(
        'Only bookings awaiting beautician assignment can be re-matched',
      );
    }

    return this.matchingOrchestrator.retryMatching(
      bookingId,
      'admin',
      startAtTier,
    );
  }

  async forceAssignAdmin(
    bookingId: string,
    beauticianUserId: string,
    adminUserId: string,
  ) {
    return this.dispatchAdmin.forceAssign(
      bookingId,
      beauticianUserId,
      adminUserId,
    );
  }
}