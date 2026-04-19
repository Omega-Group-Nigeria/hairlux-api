import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  BookingType,
  PaymentMethod,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AdminCreateBookingDto } from '../dto/admin-create-booking.dto';
import { AdminQueryBookingsDto } from '../dto/admin-query-bookings.dto';
import { GetCalendarDto } from '../dto/get-calendar.dto';
import { GetStatsDto } from '../dto/get-stats.dto';
import {
  formatBookingAddress,
  resolvePriceForBookingType,
} from '../utils/booking.utils';
import { BookingWalletService } from './booking-wallet.service';
import { ReservationService } from './reservation.service';

@Injectable()
export class BookingAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private bookingWalletService: BookingWalletService,
    private reservationService: ReservationService,
  ) {}

  async findAllBookings(queryDto: AdminQueryBookingsDto) {
    const {
      status,
      startDate,
      endDate,
      userId,
      search,
      page = 1,
      limit = 20,
    } = queryDto;

    const where: any = {};

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

    if (userId) {
      where.userId = userId;
    }

    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          address: true,
        },
        orderBy: {
          bookingDate: 'desc',
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: bookings.map((booking) => ({
        ...booking,
        totalAmount: Number(booking.totalAmount),
        address: formatBookingAddress(booking.address),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneAdmin(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        address: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      address: formatBookingAddress(booking.address),
    };
  }

  async createAdminBooking(createDto: AdminCreateBookingDto) {
    const {
      userId,
      services,
      addressId,
      bookingType,
      guestName,
      guestPhone,
      bookingDate,
      bookingTime,
      paymentMethod,
      notes,
    } = createDto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const serviceRecords: {
      serviceId: string;
      name: string;
      price: number;
      duration: number;
      notes?: string;
    }[] = [];

    for (const item of services) {
      const service = await this.prisma.service.findUnique({
        where: { id: item.serviceId },
      });

      if (!service) {
        throw new NotFoundException(`Service ${item.serviceId} not found`);
      }

      if (service.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Service "${service.name}" is not available`,
        );
      }

      serviceRecords.push({
        serviceId: service.id,
        name: service.name,
        price: resolvePriceForBookingType(service, bookingType),
        duration: service.duration,
        ...(item.notes ? { notes: item.notes } : {}),
      });
    }

    const totalAmount = serviceRecords.reduce((sum, s) => sum + s.price, 0);

    let address: Awaited<
      ReturnType<typeof this.prisma.address.findUnique>
    > | null = null;
    if (bookingType === BookingType.HOME_SERVICE) {
      address = await this.prisma.address.findUnique({
        where: { id: addressId },
      });

      if (!address) {
        throw new NotFoundException('Address not found');
      }

      if (address.userId !== userId) {
        throw new BadRequestException('Address does not belong to user');
      }
    }

    const parsedDate = new Date(bookingDate);
    const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));

    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        bookingDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        bookingTime,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        },
      },
    });

    if (existingBooking) {
      throw new ConflictException(
        'This time slot is already booked. Please choose another time.',
      );
    }

    const status = paymentMethod
      ? BookingStatus.CONFIRMED
      : BookingStatus.PENDING;

    const reservationCode = await this.reservationService.generateReservationCode();

    const booking = await this.prisma.booking.create({
      data: {
        userId,
        services: serviceRecords,
        addressId: addressId ?? null,
        bookingDate: new Date(bookingDate),
        bookingTime,
        bookingType,
        reservationCode,
        guestName: guestName ?? null,
        guestPhone: guestPhone ?? null,
        totalAmount,
        status,
        paymentMethod: paymentMethod || PaymentMethod.CASH,
        notes,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        address: true,
      },
    });

    if (paymentMethod) {
      if (paymentMethod === PaymentMethod.WALLET) {
        await this.prisma.$transaction(async (tx) => {
          await this.bookingWalletService.debitWalletAndRecordTx(tx, {
            userId,
            amount: totalAmount,
            reference: booking.id,
            description: `Payment for booking #${booking.id}`,
          });
        });
      }
    }

    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      services: serviceRecords,
      reservationCode,
      address: formatBookingAddress(booking.address),
    };
  }

  async updateStatusAdmin(id: string, status: BookingStatus) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot modify a completed booking');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cannot modify a cancelled booking');
    }

    const result = await this.prisma.$transaction(async (prisma) => {
      const updatedBooking = await prisma.booking.update({
        where: { id },
        data: { status },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          address: true,
        },
      });

      if (
        status === BookingStatus.CANCELLED &&
        (booking.status === BookingStatus.CONFIRMED ||
          booking.status === BookingStatus.PENDING)
      ) {
        const wallet = await prisma.wallet.findUnique({
          where: { userId: booking.userId },
        });

        if (wallet) {
          await prisma.wallet.update({
            where: { userId: booking.userId },
            data: {
              balance: {
                increment: booking.totalAmount,
              },
            },
          });

          await prisma.transaction.create({
            data: {
              walletId: wallet.id,
              type: TransactionType.CREDIT,
              paymentMethod: 'WALLET',
              amount: booking.totalAmount,
              description: `Refund for cancelled booking #${booking.id}`,
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
      ...(status === BookingStatus.CANCELLED &&
      booking.paymentMethod === PaymentMethod.WALLET
        ? [this.redis.del(`wallet:balance:${booking.userId}`)]
        : []),
    ]);

    return {
      ...result,
      totalAmount: Number(result.totalAmount),
      address: formatBookingAddress(result.address),
    };
  }

  async getCalendar(calendarDto: GetCalendarDto) {
    const { month, year } = calendarDto;

    if (month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12');
    }

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

    const bookings = await this.prisma.booking.findMany({
      where: {
        bookingDate: {
          gte: firstDay,
          lte: lastDay,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: [
        {
          bookingDate: 'asc',
        },
        {
          bookingTime: 'asc',
        },
      ],
    });

    const calendar: Record<string, any[]> = {};

    bookings.forEach((booking) => {
      const dateKey = booking.bookingDate.toISOString().split('T')[0];
      if (!calendar[dateKey]) {
        calendar[dateKey] = [];
      }
      calendar[dateKey].push({
        id: booking.id,
        time: booking.bookingTime,
        status: booking.status,
        user: booking.user,
        services: booking.services,
      });
    });

    return {
      month,
      year,
      bookings: calendar,
      summary: {
        totalBookings: bookings.length,
        pending: bookings.filter((b) => b.status === BookingStatus.PENDING)
          .length,
        confirmed: bookings.filter((b) => b.status === BookingStatus.CONFIRMED)
          .length,
        completed: bookings.filter((b) => b.status === BookingStatus.COMPLETED)
          .length,
        cancelled: bookings.filter((b) => b.status === BookingStatus.CANCELLED)
          .length,
      },
    };
  }

  async getStats(statsDto: GetStatsDto) {
    const { startDate, endDate } = statsDto;

    const allTime = !startDate && !endDate;

    let start: Date | undefined;
    let end: Date | undefined;

    if (!allTime) {
      if (!startDate || !endDate) {
        throw new BadRequestException(
          'Both startDate and endDate are required, or omit both for all-time stats',
        );
      }
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (start > end) {
        throw new BadRequestException('Start date must be before end date');
      }
    }

    const bookings = await this.prisma.booking.findMany({
      where: allTime ? {} : { bookingDate: { gte: start, lte: end } },
    });

    const totalBookings = bookings.length;
    const completedBookings = bookings.filter(
      (b) => b.status === BookingStatus.COMPLETED,
    );
    const paidStatuses: BookingStatus[] = [
      BookingStatus.CONFIRMED,
      BookingStatus.IN_PROGRESS,
      BookingStatus.COMPLETED,
    ];
    const paidBookings = bookings.filter((b) =>
      paidStatuses.includes(b.status),
    );
    const totalRevenue = paidBookings.reduce(
      (sum, b) => sum + Number(b.totalAmount),
      0,
    );

    const byStatus = {
      pending: bookings.filter((b) => b.status === BookingStatus.PENDING)
        .length,
      confirmed: bookings.filter((b) => b.status === BookingStatus.CONFIRMED)
        .length,
      inProgress: bookings.filter((b) => b.status === BookingStatus.IN_PROGRESS)
        .length,
      completed: completedBookings.length,
      cancelled: bookings.filter((b) => b.status === BookingStatus.CANCELLED)
        .length,
    };

    const serviceStats: Record<string, any> = {};
    bookings.forEach((booking) => {
      const isPaid = paidBookings.includes(booking);
      (booking.services as any[]).forEach((svc) => {
        const svcId = svc.serviceId;
        if (!serviceStats[svcId]) {
          serviceStats[svcId] = {
            serviceName: svc.name,
            count: 0,
            revenue: 0,
          };
        }
        serviceStats[svcId].count++;
        if (isPaid) {
          serviceStats[svcId].revenue += Number(svc.price);
        }
      });
    });

    const popularServices = Object.entries(serviceStats)
      .map(([id, stats]) => ({ serviceId: id, ...stats }))
      .sort((a, b) => b.count - a.count);

    return {
      period: allTime
        ? { allTime: true }
        : { allTime: false, startDate, endDate },
      overview: {
        totalBookings,
        totalRevenue,
        averageBookingValue:
          paidBookings.length > 0 ? totalRevenue / paidBookings.length : 0,
      },
      byStatus,
      topServices: popularServices.slice(0, 5),
    };
  }
}
