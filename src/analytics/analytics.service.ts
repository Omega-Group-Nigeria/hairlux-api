import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingStatus,
  PaymentMethod,
  TransactionStatus,
  TransactionType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { GetRevenueDto } from './dto/get-revenue.dto';
import { GetBookingTrendsDto } from './dto/get-booking-trends.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getDashboard() {
    const cached = await this.redis.get('analytics:dashboard');
    if (cached) return cached;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const [
      todayBookings,
      pendingBookings,
      totalUsers,
      totalCompletedBookings,
      activeUsers,
      todayRevenue,
      grossRevenue,
      totalRefunds,
    ] = await Promise.all([
      // Bookings created today (all statuses)
      this.prisma.booking.findMany({
        where: { createdAt: { gte: startOfToday, lte: endOfToday } },
        select: { status: true },
      }),
      // All-time pending count
      this.prisma.booking.count({ where: { status: BookingStatus.PENDING } }),
      // Total registered users (role USER only)
      this.prisma.user.count({ where: { role: UserRole.USER } }),
      // Total completed bookings all-time
      this.prisma.booking.count({ where: { status: BookingStatus.COMPLETED } }),
      // Active users with role USER
      this.prisma.user.count({
        where: { role: UserRole.USER, status: UserStatus.ACTIVE },
      }),
      // Today's revenue: wallet-paid bookings created today (CONFIRMED or COMPLETED)
      this.prisma.booking.aggregate({
        where: {
          paymentMethod: PaymentMethod.WALLET,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
          createdAt: { gte: startOfToday, lte: endOfToday },
        },
        _sum: { totalAmount: true },
      }),
      // All-time booking revenue: wallet-paid bookings (CONFIRMED or COMPLETED)
      this.prisma.booking.aggregate({
        where: {
          paymentMethod: PaymentMethod.WALLET,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
        },
        _sum: { totalAmount: true },
      }),
      // All-time completed refunds
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.REFUND,
          status: TransactionStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
    ]);

    const grossRevenueAmount = Number(grossRevenue._sum.totalAmount || 0);
    const totalRefundAmount = Number(totalRefunds._sum.amount || 0);

    const result = {
      today: {
        bookings: todayBookings.length,
        completed: todayBookings.filter(
          (b) => b.status === BookingStatus.COMPLETED,
        ).length,
        pending: todayBookings.filter((b) => b.status === BookingStatus.PENDING)
          .length,
        confirmed: todayBookings.filter(
          (b) => b.status === BookingStatus.CONFIRMED,
        ).length,
        revenue: Number(todayRevenue._sum.totalAmount || 0),
      },
      overall: {
        grossRevenue: grossRevenueAmount,
        totalRefunds: totalRefundAmount,
        netRevenue: grossRevenueAmount - totalRefundAmount,
        totalUsers,
        totalCompletedBookings,
        activeUsers,
        pendingBookings,
      },
    };

    await this.redis.set('analytics:dashboard', result, 60);
    return result;
  }

  async getUserStats() {
    const cached = await this.redis.get('analytics:users');
    if (cached) return cached;

    const [total, active, inactive, admins] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.USER } }),
      this.prisma.user.count({
        where: { role: UserRole.USER, status: UserStatus.ACTIVE },
      }),
      this.prisma.user.count({
        where: { role: UserRole.USER, status: UserStatus.INACTIVE },
      }),
      this.prisma.user.count({
        where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } },
      }),
    ]);

    const result = { total, active, inactive, admins };
    await this.redis.set('analytics:users', result, 300);
    return result;
  }

  async getRevenue(dto: GetRevenueDto) {
    const { startDate, endDate } = dto;
    const cacheKey = `analytics:revenue:${startDate}:${endDate}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Revenue = wallet-paid bookings (CONFIRMED or COMPLETED) created in range
    const paidBookings = await this.prisma.booking.findMany({
      where: {
        paymentMethod: PaymentMethod.WALLET,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
        createdAt: { gte: start, lte: end },
      },
      select: {
        totalAmount: true,
        createdAt: true,
        service: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalRevenue = paidBookings.reduce(
      (sum, b) => sum + Number(b.totalAmount),
      0,
    );

    // Group by date (createdAt)
    const revenueByDate: Record<string, number> = {};
    paidBookings.forEach((b) => {
      const key = b.createdAt.toISOString().split('T')[0];
      revenueByDate[key] = (revenueByDate[key] || 0) + Number(b.totalAmount);
    });

    // Group by service name
    const revenueByService: Record<string, number> = {};
    paidBookings.forEach((b) => {
      const name = b.service.name;
      revenueByService[name] =
        (revenueByService[name] || 0) + Number(b.totalAmount);
    });

    const revenueResult = {
      period: { startDate, endDate },
      summary: {
        totalRevenue,
        totalPaidBookings: paidBookings.length,
        averageBookingAmount:
          paidBookings.length > 0 ? totalRevenue / paidBookings.length : 0,
      },
      byDate: Object.entries(revenueByDate)
        .map(([date, revenue]) => ({ date, revenue }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byService: Object.entries(revenueByService)
        .map(([service, revenue]) => ({ service, revenue }))
        .sort((a, b) => b.revenue - a.revenue),
    };
    await this.redis.set(cacheKey, revenueResult, 300);
    return revenueResult;
  }

  async getBookingTrends(dto: GetBookingTrendsDto) {
    const { startDate, endDate } = dto;
    const cacheKey = `analytics:bookings:${startDate}:${endDate}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get all bookings created in date range
    const bookings = await this.prisma.booking.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        bookingDate: true,
        bookingTime: true,
        status: true,
        service: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        bookingDate: 'asc',
      },
    });

    // Group bookings by date
    const bookingsByDate: Record<string, number> = {};
    const bookingsByStatus: Record<string, number> = {};
    const bookingsByService: Record<
      string,
      { serviceId: string; serviceName: string; count: number }
    > = {};
    const bookingsByTimeSlot: Record<string, number> = {};

    bookings.forEach((booking) => {
      const dateKey = booking.bookingDate.toISOString().split('T')[0];

      // By date
      if (!bookingsByDate[dateKey]) {
        bookingsByDate[dateKey] = 0;
      }
      bookingsByDate[dateKey]++;

      // By status
      if (!bookingsByStatus[booking.status]) {
        bookingsByStatus[booking.status] = 0;
      }
      bookingsByStatus[booking.status]++;

      // By service
      const serviceId = booking.service.id;
      if (!bookingsByService[serviceId]) {
        bookingsByService[serviceId] = {
          serviceId,
          serviceName: booking.service.name,
          count: 0,
        };
      }
      bookingsByService[serviceId].count++;

      // By time slot (group into hour blocks)
      const hour = booking.bookingTime.split(':')[0];
      const timeSlot = `${hour}:00`;
      if (!bookingsByTimeSlot[timeSlot]) {
        bookingsByTimeSlot[timeSlot] = 0;
      }
      bookingsByTimeSlot[timeSlot]++;
    });

    // Find peak booking time
    const peakTime = Object.entries(bookingsByTimeSlot).sort(
      ([, a], [, b]) => b - a,
    )[0];

    // Find most popular services
    const popularServices = Object.values(bookingsByService)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const trendsResult = {
      period: {
        startDate,
        endDate,
      },
      summary: {
        totalBookings: bookings.length,
        peakBookingTime: peakTime ? peakTime[0] : null,
        peakBookingCount: peakTime ? peakTime[1] : 0,
      },
      byDate: Object.entries(bookingsByDate)
        .map(([date, count]) => ({
          date,
          count,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byStatus: Object.entries(bookingsByStatus).map(([status, count]) => ({
        status,
        count,
      })),
      popularServices,
      byTimeSlot: Object.entries(bookingsByTimeSlot)
        .map(([time, count]) => ({
          time,
          count,
        }))
        .sort((a, b) => a.time.localeCompare(b.time)),
    };
    await this.redis.set(cacheKey, trendsResult, 300);
    return trendsResult;
  }
}
