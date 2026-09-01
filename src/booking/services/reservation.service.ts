import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, BookingType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  bookingAdminReadInclude,
  bookingUserReadInclude,
  formatBookingResponse,
} from '../utils/booking.utils';

@Injectable()
export class ReservationService {
  // Avoids visually ambiguous chars (0, O, 1, I)
  private readonly CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private generateCode(length = 4): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      code +=
        this.CODE_CHARS[Math.floor(Math.random() * this.CODE_CHARS.length)];
    }
    return `HLX-${code}`;
  }

  async generateReservationCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.generateCode();
      const existing = await this.prisma.booking.findUnique({
        where: { reservationCode: code },
      });
      if (!existing) return code;
    }
    throw new Error('Could not generate a unique reservation code');
  }

  async findByReservationCode(code: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reservationCode: code.toUpperCase() },
      include: bookingUserReadInclude,
    });

    if (!booking) {
      throw new NotFoundException('Reservation code not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('This reservation does not belong to you');
    }

    return formatBookingResponse(booking);
  }

  async adminFindByReservationCode(code: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reservationCode: code.toUpperCase() },
      include: bookingAdminReadInclude,
    });

    if (!booking) {
      throw new NotFoundException('Reservation code not found');
    }

    return {
      ...formatBookingResponse(booking),
      isValid:
        !booking.reservationUsed && booking.status !== BookingStatus.CANCELLED,
    };
  }

  async useReservation(code: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reservationCode: code.toUpperCase() },
    });

    if (!booking) {
      throw new NotFoundException('Reservation code not found');
    }

    if (booking.reservationUsed) {
      throw new ConflictException('This reservation has already been used');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException(
        'This reservation is cancelled and cannot be used',
      );
    }

    const updated = await this.prisma.booking.update({
      where: { reservationCode: code.toUpperCase() },
      data: {
        reservationUsed: true,
        // WALK_IN: customer is present, service rendered immediately -> COMPLETED
        // HOME_SERVICE / MIXED: stylist visit involved -> IN_PROGRESS
        status:
          booking.bookingType === BookingType.WALK_IN
            ? BookingStatus.COMPLETED
            : BookingStatus.IN_PROGRESS,
        // Only meaningful (and only set) for the WALK_IN->COMPLETED case above --
        // this is what branch-finance and other revenue reporting bucket by, so
        // it needs to be set the same moment the booking actually completes,
        // not left null (previously the case here, unlike the home-service
        // completion flow, which already sets this correctly).
        ...(booking.bookingType === BookingType.WALK_IN && { serviceCompletedAt: new Date() }),
      },
      include: bookingAdminReadInclude,
    });

    void this.redis.delByPattern('analytics:*');

    return formatBookingResponse(updated);
  }
}
