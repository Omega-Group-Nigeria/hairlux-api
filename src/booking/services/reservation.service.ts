import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, BookingType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { formatBookingAddress } from '../utils/booking.utils';

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
      include: {
        address: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Reservation code not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('This reservation does not belong to you');
    }

    return booking;
  }

  async adminFindByReservationCode(code: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reservationCode: code.toUpperCase() },
      include: {
        address: true,
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
      throw new NotFoundException('Reservation code not found');
    }

    return {
      ...booking,
      address: formatBookingAddress(booking.address),
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
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        address: true,
      },
    });

    void this.redis.delByPattern('analytics:*');

    return {
      ...updated,
      address: formatBookingAddress(updated.address),
    };
  }
}
