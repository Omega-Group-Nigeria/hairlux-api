import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetRevenueDto } from './dto/get-revenue.dto';
import { GetBookingTrendsDto } from './dto/get-booking-trends.dto';

@ApiTags('Admin - Analytics')
@ApiBearerAuth('JWT-auth')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get dashboard overview',
    description:
      'Get key metrics for today and overall statistics including bookings, revenue, and active users',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
    example: {
      today: {
        bookings: 8,
        completed: 3,
        pending: 2,
        confirmed: 3,
        revenue: 45000,
      },
      overall: {
        totalRevenue: 1500000,
        totalUsers: 150,
        totalCompletedBookings: 245,
        activeUsers: 45,
        pendingBookings: 12,
      },
    },
  })
  async getDashboard() {
    return this.analyticsService.getDashboard();
  }

  @Get('revenue')
  @ApiOperation({
    summary: 'Get revenue analytics',
    description:
      'Get revenue breakdown by date and service for a specified date range',
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue data retrieved successfully',
    example: {
      period: {
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      },
      summary: {
        totalRevenue: 500000,
        totalBookings: 50,
        averageRevenue: 10000,
      },
      byDate: [
        {
          date: '2026-02-01',
          revenue: 25000,
        },
        {
          date: '2026-02-02',
          revenue: 30000,
        },
      ],
      byService: [
        {
          service: 'Premium Hair Treatment',
          revenue: 150000,
        },
        {
          service: 'Bridal Makeup',
          revenue: 120000,
        },
      ],
    },
  })
  async getRevenue(@Query() dto: GetRevenueDto) {
    return this.analyticsService.getRevenue(dto);
  }

  @Get('users')
  @ApiOperation({
    summary: 'Get user statistics',
    description: 'Get a breakdown of total, active, inactive and admin users',
  })
  @ApiResponse({
    status: 200,
    description: 'User statistics retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'User statistics retrieved successfully',
        data: {
          total: 200,
          active: 175,
          inactive: 25,
          admins: 3,
        },
      },
    },
  })
  async getUserStats() {
    const data = await this.analyticsService.getUserStats();
    return {
      success: true,
      message: 'User statistics retrieved successfully',
      data,
    };
  }

  @Get('bookings')
  @ApiOperation({
    summary: 'Get booking trends and analytics',
    description:
      'Get booking trends by date, status, service, and time slots for a specified date range',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking trends retrieved successfully',
    example: {
      period: {
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      },
      summary: {
        totalBookings: 120,
        peakBookingTime: '10:00',
        peakBookingCount: 25,
      },
      byDate: [
        {
          date: '2026-02-01',
          count: 5,
        },
        {
          date: '2026-02-02',
          count: 7,
        },
      ],
      byStatus: [
        {
          status: 'COMPLETED',
          count: 60,
        },
        {
          status: 'CONFIRMED',
          count: 40,
        },
        {
          status: 'PENDING',
          count: 15,
        },
        {
          status: 'CANCELLED',
          count: 5,
        },
      ],
      popularServices: [
        {
          serviceId: 'clx1234567890',
          serviceName: 'Premium Hair Treatment',
          count: 35,
        },
        {
          serviceId: 'clx0987654321',
          serviceName: 'Bridal Makeup',
          count: 28,
        },
      ],
      byTimeSlot: [
        {
          time: '09:00',
          count: 8,
        },
        {
          time: '10:00',
          count: 25,
        },
        {
          time: '11:00',
          count: 20,
        },
      ],
    },
  })
  async getBookingTrends(@Query() dto: GetBookingTrendsDto) {
    return this.analyticsService.getBookingTrends(dto);
  }
}
