import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AdminQueryBookingsDto } from './dto/admin-query-bookings.dto';
import { AdminCreateBookingDto } from './dto/admin-create-booking.dto';
import { GetCalendarDto } from './dto/get-calendar.dto';
import { GetStatsDto } from './dto/get-stats.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import {
  SetBusinessHoursDto,
  BusinessHoursDayDto,
} from './dto/set-business-hours.dto';
import { CreateBusinessExceptionDto } from './dto/create-business-exception.dto';

@ApiTags('Admin - Bookings')
@ApiBearerAuth('JWT-auth')
@Controller('admin/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminBookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all bookings with filters',
    description:
      'Admin endpoint to retrieve all bookings with optional filters for date, status, user, service, and search',
  })
  @ApiResponse({
    status: 200,
    description: 'Bookings retrieved successfully',
    example: {
      data: [
        {
          id: 'clx1234567890',
          userId: 'clx0987654321',
          serviceId: 'clx5555555555',
          addressId: 'clx6666666666',
          bookingDate: '2026-02-20T00:00:00.000Z',
          bookingTime: '10:00',
          totalAmount: 15000,
          status: 'CONFIRMED',
          notes: null,
          createdAt: '2026-02-17T10:00:00.000Z',
          updatedAt: '2026-02-17T10:00:00.000Z',
          user: {
            id: 'clx0987654321',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '+2348012345678',
          },
          service: {
            id: 'clx5555555555',
            name: 'Premium Hair Treatment',
            price: 15000,
            duration: 90,
          },
          address: {
            id: 'clx6666666666',
            street: '123 Main St',
            city: 'Lagos',
            state: 'Lagos',
            country: 'Nigeria',
            latitude: 6.5244,
            longitude: 3.3792,
          },
        },
      ],
      meta: {
        total: 45,
        page: 1,
        limit: 20,
        totalPages: 3,
      },
    },
  })
  async getAllBookings(@Query() queryDto: AdminQueryBookingsDto) {
    return this.bookingService.findAllBookings(queryDto);
  }

  @Get('calendar')
  @ApiOperation({
    summary: 'Get calendar view of bookings',
    description: 'Get bookings organized by date for a specific month and year',
  })
  @ApiResponse({
    status: 200,
    description: 'Calendar view retrieved successfully',
    example: {
      month: 2,
      year: 2026,
      bookings: {
        '2026-02-15': [
          {
            id: 'clx1234567890',
            time: '10:00',
            status: 'CONFIRMED',
            user: {
              id: 'clx0987654321',
              firstName: 'John',
              lastName: 'Doe',
              email: 'john@example.com',
            },
            service: {
              id: 'clx5555555555',
              name: 'Premium Hair Treatment',
              duration: 90,
            },
          },
          {
            id: 'clx1234567891',
            time: '14:00',
            status: 'PENDING',
            user: {
              id: 'clx0987654322',
              firstName: 'Jane',
              lastName: 'Smith',
              email: 'jane@example.com',
            },
            service: {
              id: 'clx5555555556',
              name: 'Bridal Makeup',
              duration: 120,
            },
          },
        ],
        '2026-02-16': [],
        '2026-02-17': [
          {
            id: 'clx1234567892',
            time: '11:00',
            status: 'CONFIRMED',
            user: {
              id: 'clx0987654323',
              firstName: 'Mike',
              lastName: 'Johnson',
              email: 'mike@example.com',
            },
            service: {
              id: 'clx5555555557',
              name: 'Spa Treatment',
              duration: 60,
            },
          },
        ],
      },
      summary: {
        totalBookings: 3,
        pending: 1,
        confirmed: 2,
        completed: 0,
        cancelled: 0,
      },
    },
  })
  async getCalendar(@Query() calendarDto: GetCalendarDto) {
    return this.bookingService.getCalendar(calendarDto);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get booking statistics',
    description:
      'Get comprehensive booking statistics for a date range including revenue, popular services, and status breakdown',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
    example: {
      period: {
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      },
      overview: {
        totalBookings: 120,
        totalRevenue: 1500000,
        averageBookingValue: 15000,
      },
      byStatus: {
        pending: 15,
        confirmed: 45,
        completed: 50,
        cancelled: 10,
      },
      topServices: [
        {
          serviceId: 'clx5555555555',
          serviceName: 'Premium Hair Treatment',
          count: 35,
          revenue: 525000,
        },
        {
          serviceId: 'clx5555555556',
          serviceName: 'Bridal Makeup',
          count: 28,
          revenue: 560000,
        },
        {
          serviceId: 'clx5555555557',
          serviceName: 'Spa Treatment',
          count: 25,
          revenue: 250000,
        },
      ],
    },
  })
  async getStats(@Query() statsDto: GetStatsDto) {
    return this.bookingService.getStats(statsDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get detailed booking information',
    description:
      'Get complete details of a specific booking including user, service, and address information',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking details retrieved successfully',
    example: {
      success: true,
      message: 'Booking details retrieved successfully',
      data: {
        id: 'clx1234567890',
        userId: 'clx0987654321',
        serviceId: 'clx5555555555',
        addressId: 'clx6666666666',
        bookingDate: '2026-02-20T00:00:00.000Z',
        bookingTime: '10:00',
        totalAmount: 15000,
        status: 'CONFIRMED',
        notes: 'Prefers afternoon appointments',
        discountCode: null,
        createdAt: '2026-02-17T10:00:00.000Z',
        updatedAt: '2026-02-17T10:00:00.000Z',
        user: {
          id: 'clx0987654321',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '+2348012345678',
        },
        service: {
          id: 'clx5555555555',
          name: 'Premium Hair Treatment',
          description: 'Deep conditioning and styling session',
          price: 15000,
          duration: 90,
          category: {
            id: 'clxcat111',
            name: 'Hair Treatments',
          },
        },
        address: {
          id: 'clx6666666666',
          street: '12 Adeola Odeku St',
          city: 'Victoria Island',
          state: 'Lagos',
          country: 'Nigeria',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found',
  })
  async getBookingDetails(@Param('id') id: string) {
    const data = await this.bookingService.findOneAdmin(id);
    return {
      success: true,
      message: 'Booking details retrieved successfully',
      data,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Create manual booking',
    description:
      'Create a booking on behalf of a user (for walk-ins or phone bookings). Can optionally process payment immediately.',
  })
  @ApiResponse({
    status: 201,
    description: 'Booking created successfully',
    example: {
      id: 'clx1234567890',
      userId: 'clx0987654321',
      serviceId: 'clx5555555555',
      addressId: 'clx6666666666',
      bookingDate: '2026-02-20T00:00:00.000Z',
      bookingTime: '10:00',
      totalAmount: 15000,
      status: 'CONFIRMED',
      notes: 'Walk-in customer, paid in cash',
      createdAt: '2026-02-17T10:00:00.000Z',
      updatedAt: '2026-02-17T10:00:00.000Z',
      user: {
        id: 'clx0987654321',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '+2348012345678',
      },
      service: {
        id: 'clx5555555555',
        name: 'Premium Hair Treatment',
        price: 15000,
        duration: 90,
      },
      address: {
        id: 'clx6666666666',
        street: '123 Main St',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation error or slot unavailable',
  })
  @ApiResponse({
    status: 404,
    description: 'User, service, or address not found',
  })
  async createManualBooking(@Body() createDto: AdminCreateBookingDto) {
    return this.bookingService.createAdminBooking(createDto);
  }

  @Put(':id/status')
  @ApiOperation({
    summary: 'Update booking status',
    description:
      'Admin endpoint to update booking status (confirm, complete, cancel). Handles refunds automatically for cancellations.',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking status updated successfully',
    example: {
      id: 'clx1234567890',
      status: 'COMPLETED',
      totalAmount: 15000,
      user: {
        id: 'clx0987654321',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '+2348012345678',
      },
      service: {
        id: 'clx5555555555',
        name: 'Premium Hair Treatment',
        price: 15000,
        duration: 90,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot modify completed or cancelled booking',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found',
  })
  async updateBookingStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateBookingStatusDto,
  ) {
    return this.bookingService.updateStatusAdmin(id, updateDto.status);
  }

  // ─── Business Hours ──────────────────────────────────────────────────────────

  @Post('business-hours')
  @ApiOperation({
    summary: 'Set weekly business hours',
    description:
      'Upsert open/close times for one or all days of the week. ' +
      'dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday.',
  })
  @ApiResponse({
    status: 201,
    description: 'Business hours saved successfully',
    example: {
      success: true,
      message: 'Business hours saved successfully',
      data: [
        {
          id: 'uuid',
          dayOfWeek: 1,
          openTime: '09:00',
          closeTime: '17:00',
          isOpen: true,
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (invalid time format)',
  })
  async setBusinessHours(@Body() dto: SetBusinessHoursDto) {
    const data = await this.bookingService.setBusinessHours(dto);
    return {
      success: true,
      message: 'Business hours saved successfully',
      data,
    };
  }

  @Put('business-hours/:dayOfWeek')
  @ApiOperation({
    summary: "Update a single day's hours",
    description:
      'Update open/close time or toggle isOpen for a single day. ' +
      'dayOfWeek param: 0=Sunday ... 6=Saturday.',
  })
  @ApiResponse({ status: 200, description: 'Day updated successfully' })
  @ApiResponse({
    status: 404,
    description:
      'No hours configured for this day yet — use POST /business-hours first',
  })
  async updateBusinessHoursDay(
    @Param('dayOfWeek') dayOfWeek: string,
    @Body() dto: BusinessHoursDayDto,
  ) {
    const data = await this.bookingService.updateBusinessHoursDay(
      Number(dayOfWeek),
      dto,
    );
    return {
      success: true,
      message: 'Business hours updated successfully',
      data,
    };
  }

  // ─── Business Exceptions ─────────────────────────────────────────────────────

  @Post('business-exceptions')
  @ApiOperation({
    summary: 'Create a business exception',
    description:
      'Add a date override — e.g. close on a holiday, or open on a weekend with special hours. ' +
      'If isClosed is false, openTime and closeTime are required.',
  })
  @ApiResponse({
    status: 201,
    description: 'Exception created successfully',
    example: {
      success: true,
      message: 'Business exception created successfully',
      data: {
        id: 'uuid',
        date: '2026-12-25T00:00:00.000Z',
        isClosed: true,
        reason: 'Christmas Holiday',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 409,
    description: 'Exception already exists for this date',
  })
  async createBusinessException(@Body() dto: CreateBusinessExceptionDto) {
    const data = await this.bookingService.createBusinessException(dto);
    return {
      success: true,
      message: 'Business exception created successfully',
      data,
    };
  }

  @Delete('business-exceptions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a business exception',
    description:
      'Remove a date-specific exception. The regular weekly hours will apply again.',
  })
  @ApiResponse({ status: 200, description: 'Exception deleted successfully' })
  @ApiResponse({ status: 404, description: 'Exception not found' })
  async deleteBusinessException(@Param('id') id: string) {
    await this.bookingService.deleteBusinessException(id);
    return {
      success: true,
      message: 'Business exception deleted successfully',
    };
  }
}
