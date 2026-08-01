import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingCommsSessionStatus,
  BookingStatus,
  BookingType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_HOME_SERVICE_STATUSES } from '../../beautician/home-service-booking/home-service-status.service';

@Injectable()
export class CommsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getBookingForCommsAccess(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedBeautician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            beauticianProfile: {
              select: { profilePhotoUrl: true },
            },
          },
        },
        commsSession: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  assertParticipant(
    booking: {
      userId: string;
      assignedBeauticianUserId: string | null;
    },
    requesterUserId: string,
  ): 'customer' | 'beautician' {
    if (booking.userId === requesterUserId) {
      return 'customer';
    }

    if (booking.assignedBeauticianUserId === requesterUserId) {
      return 'beautician';
    }

    throw new ForbiddenException('You are not a participant on this booking');
  }

  isHomeServiceBooking(bookingType: BookingType): boolean {
    return bookingType === BookingType.HOME_SERVICE;
  }

  canUseComms(
    bookingStatus: BookingStatus,
    sessionStatus: BookingCommsSessionStatus | null | undefined,
  ): boolean {
    return (
      sessionStatus === BookingCommsSessionStatus.ACTIVE &&
      ACTIVE_HOME_SERVICE_STATUSES.includes(bookingStatus)
    );
  }

  buildDisplayName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
  ): string {
    return [firstName, lastName].filter(Boolean).join(' ').trim() || 'User';
  }
}