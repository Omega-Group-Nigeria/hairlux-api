import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  PaymentMethod,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueryBookingsDto } from '../dto/query-bookings.dto';
import { RescheduleBookingDto } from '../dto/reschedule-booking.dto';

@Injectable()
export class BookingCoreService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

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
      include: {
        address: true,
      },
      orderBy: {
        bookingDate: 'desc',
      },
    });

    return bookings;
  }

  async findOne(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
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
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    return booking;
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
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        id: { not: id },
        bookingDate: newBookingDate,
        bookingTime: time,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        },
      },
    });

    if (existingBooking) {
      throw new ConflictException('This time slot is already booked');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        bookingDate: newBookingDate,
        bookingTime: time,
        notes: reason ? `Rescheduled: ${reason}` : booking.notes,
      },
      include: {
        address: true,
      },
    });

    return updatedBooking;
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

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id },
        data: {
          status,
          cancelReason: reason,
        },
        include: {
          address: true,
        },
      });

      if (booking.paymentMethod === PaymentMethod.WALLET) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: booking.userId },
        });

        if (wallet) {
          const refundAmount = Number(booking.totalAmount);

          await tx.wallet.update({
            where: { userId: booking.userId },
            data: {
              balance: {
                increment: refundAmount,
              },
            },
          });

          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              amount: refundAmount,
              type: TransactionType.CREDIT,
              paymentMethod: 'WALLET',
              description: 'Refund for cancelled booking',
              reference: `REFUND-${booking.id}`,
              status: TransactionStatus.COMPLETED,
            },
          });
        }
      }

      return updatedBooking;
    });

    void Promise.all([
      this.redis.delByPattern('analytics:*'),
      ...(booking.paymentMethod === PaymentMethod.WALLET
        ? [this.redis.del(`wallet:balance:${userId}`)]
        : []),
    ]);

    return result;
  }
}
