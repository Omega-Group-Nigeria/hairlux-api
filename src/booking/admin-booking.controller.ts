import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
  ApiParam,
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
      'Admin endpoint to retrieve all bookings with optional filters for date, status, user, and search',
  })
  @ApiResponse({
    status: 200,
    description: 'Bookings retrieved successfully',
    example: {
      data: [
        {
          id: 'booking-uuid-1',
          userId: 'user-uuid',
          bookingType: 'HOME_SERVICE',
          bookingDate: '2026-02-20T00:00:00.000Z',
          bookingTime: '10:00',
          totalAmount: 45000,
          status: 'CONFIRMED',
          reservationCode: 'HLX-A3K9',
          reservationUsed: false,
          guestName: null,
          guestPhone: null,
          guestEmail: null,
          notes: null,
          createdAt: '2026-02-17T10:00:00.000Z',
          updatedAt: '2026-02-17T10:00:00.000Z',
          user: {
            id: 'user-uuid',
            firstName: 'Amara',
            lastName: 'Okafor',
            email: 'amara@example.com',
            phone: '+2348012345678',
          },
          services: [
            {
              serviceId: 'svc-uuid-1',
              name: 'Box Braids',
              price: 25000,
              duration: 180,
            },
            {
              serviceId: 'svc-uuid-2',
              name: 'Deep Conditioning',
              price: 20000,
              duration: 60,
            },
          ],
          address: {
            id: 'addr-uuid',
            fullAddress: '15 Lekki Phase 1, Lagos, Nigeria',
            streetAddress: '15 Lekki Phase 1',
            city: 'Lagos',
            state: 'Lagos',
            placeId: 'ChIJ...',
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
            id: 'booking-uuid-1',
            time: '10:00',
            status: 'CONFIRMED',
            user: {
              id: 'user-uuid-1',
              firstName: 'Amara',
              lastName: 'Okafor',
              email: 'amara@example.com',
            },
            services: [
              {
                serviceId: 'svc-uuid-1',
                name: 'Box Braids',
                price: 25000,
                duration: 180,
              },
            ],
          },
          {
            id: 'booking-uuid-2',
            time: '14:00',
            status: 'PENDING',
            user: {
              id: 'user-uuid-2',
              firstName: 'Jane',
              lastName: 'Smith',
              email: 'jane@example.com',
            },
            services: [
              {
                serviceId: 'svc-uuid-2',
                name: 'Bridal Styling',
                price: 50000,
                duration: 240,
              },
              {
                serviceId: 'svc-uuid-3',
                name: 'Deep Conditioning',
                price: 20000,
                duration: 60,
              },
            ],
          },
        ],
      },
      summary: {
        totalBookings: 2,
        pending: 1,
        confirmed: 1,
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
      'Get comprehensive booking statistics including revenue, popular services, and status breakdown. ' +
      'Pass `startDate` + `endDate` for a specific range, or omit both to get all-time stats.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
    example: {
      period: {
        allTime: false,
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
        inProgress: 5,
        completed: 50,
        cancelled: 10,
      },
      topServices: [
        {
          serviceId: 'svc-uuid-1',
          serviceName: 'Box Braids',
          count: 35,
          revenue: 525000,
        },
        {
          serviceId: 'svc-uuid-2',
          serviceName: 'Bridal Styling',
          count: 28,
          revenue: 560000,
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Only one of startDate/endDate provided',
  })
  async getStats(@Query() statsDto: GetStatsDto) {
    return this.bookingService.getStats(statsDto);
  }

  // ─── Reservation Code ─────────────────────────────────────────────────────

  @Get('reservation/:code')
  @ApiOperation({
    summary: 'Look up a booking by reservation code',
    description:
      'Returns full booking details and a validity flag. ' +
      'isValid is false if the reservation has already been used or the booking is cancelled.',
  })
  @ApiParam({
    name: 'code',
    description: 'Reservation code (e.g. HLX-A3K9)',
    example: 'HLX-A3K9',
  })
  @ApiResponse({
    status: 200,
    description: 'Reservation found',
    example: {
      success: true,
      message: 'Reservation found',
      data: {
        id: 'booking-uuid',
        reservationCode: 'HLX-A3K9',
        reservationUsed: false,
        isValid: true,
        bookingType: 'HOME_SERVICE',
        bookingDate: '2026-03-10T10:00:00.000Z',
        bookingTime: '10:00',
        status: 'CONFIRMED',
        totalAmount: 45000,
        paymentMethod: 'WALLET',
        guestName: 'Amara Okafor',
        guestPhone: '+2348012345678',
        guestEmail: 'amara.okafor@example.com',
        services: [
          {
            serviceId: 'svc-uuid-1',
            name: 'Box Braids',
            price: 25000,
            duration: 180,
          },
          {
            serviceId: 'svc-uuid-2',
            name: 'Deep Conditioning',
            price: 20000,
            duration: 60,
          },
        ],
        user: {
          id: 'user-uuid',
          firstName: 'Amara',
          lastName: 'Okafor',
          email: 'amara@example.com',
          phone: '+2348012345678',
        },
        address: {
          id: 'addr-uuid',
          fullAddress: '15 Lekki Phase 1, Lagos, Nigeria',
          streetAddress: '15 Lekki Phase 1',
          city: 'Lagos',
          state: 'Lagos',
          placeId: 'ChIJ...',
        },
        createdAt: '2026-03-01T09:00:00.000Z',
        updatedAt: '2026-03-01T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Reservation code not found' })
  async adminFindByReservationCode(@Param('code') code: string) {
    const data = await this.bookingService.adminFindByReservationCode(code);
    return { success: true, message: 'Reservation found', data };
  }

  @Patch('reservation/:code/use')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a reservation as used',
    description:
      'Marks the reservation as used. ' +
      'WALK_IN bookings → status set to COMPLETED (service rendered on the spot). ' +
      'HOME_SERVICE bookings → status set to IN_PROGRESS (stylist en route / arrived). ' +
      'Returns 409 if already used or booking is cancelled.',
  })
  @ApiParam({
    name: 'code',
    description: 'Reservation code',
    example: 'HLX-A3K9',
  })
  @ApiResponse({
    status: 200,
    description: 'Reservation marked as used',
    example: {
      success: true,
      message: 'Reservation marked as used',
      data: {
        id: 'booking-uuid',
        reservationCode: 'HLX-A3K9',
        reservationUsed: true,
        status: 'COMPLETED',
        bookingType: 'WALK_IN',
        totalAmount: 45000,
        services: [
          {
            serviceId: 'svc-uuid-1',
            name: 'Box Braids',
            price: 25000,
            duration: 180,
          },
        ],
        user: {
          id: 'user-uuid',
          firstName: 'Amara',
          lastName: 'Okafor',
          phone: '+2348012345678',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Reservation code not found' })
  @ApiResponse({
    status: 409,
    description: 'Already used or booking is cancelled',
  })
  async useReservation(@Param('code') code: string) {
    const data = await this.bookingService.useReservation(code);
    return { success: true, message: 'Reservation marked as used', data };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get detailed booking information',
    description:
      'Get complete details of a specific booking including user, services array, and address information',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking details retrieved successfully',
    example: {
      success: true,
      message: 'Booking details retrieved successfully',
      data: {
        id: 'booking-uuid',
        userId: 'user-uuid',
        bookingType: 'HOME_SERVICE',
        bookingDate: '2026-02-20T00:00:00.000Z',
        bookingTime: '10:00',
        totalAmount: 45000,
        status: 'CONFIRMED',
        reservationCode: 'HLX-A3K9',
        reservationUsed: false,
        guestName: null,
        guestPhone: null,
        guestEmail: null,
        notes: 'Prefers afternoon appointments',
        createdAt: '2026-02-17T10:00:00.000Z',
        updatedAt: '2026-02-17T10:00:00.000Z',
        user: {
          id: 'user-uuid',
          firstName: 'Amara',
          lastName: 'Okafor',
          email: 'amara@example.com',
          phone: '+2348012345678',
        },
        services: [
          {
            serviceId: 'svc-uuid-1',
            name: 'Box Braids',
            price: 25000,
            duration: 180,
          },
          {
            serviceId: 'svc-uuid-2',
            name: 'Deep Conditioning',
            price: 20000,
            duration: 60,
          },
        ],
        address: {
          id: 'addr-uuid',
          fullAddress: '15 Lekki Phase 1, Lagos, Nigeria',
          streetAddress: '15 Lekki Phase 1',
          city: 'Lagos',
          state: 'Lagos',
          placeId: 'ChIJ...',
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
      id: 'booking-uuid',
      userId: 'user-uuid',
      bookingType: 'WALK_IN',
      bookingDate: '2026-02-20T00:00:00.000Z',
      bookingTime: '10:00',
      totalAmount: 45000,
      status: 'CONFIRMED',
      reservationCode: 'HLX-B7XQ',
      reservationUsed: false,
      guestName: 'Amara Okafor',
      guestPhone: '+2348012345678',
      notes: 'Walk-in customer, paid in cash',
      paymentMethod: 'CASH',
      createdAt: '2026-02-17T10:00:00.000Z',
      updatedAt: '2026-02-17T10:00:00.000Z',
      user: {
        id: 'user-uuid',
        firstName: 'Amara',
        lastName: 'Okafor',
        email: 'amara@example.com',
        phone: '+2348012345678',
      },
      services: [
        {
          serviceId: 'svc-uuid-1',
          name: 'Box Braids',
          price: 25000,
          duration: 180,
        },
        {
          serviceId: 'svc-uuid-2',
          name: 'Deep Conditioning',
          price: 20000,
          duration: 60,
        },
      ],
      address: null,
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
      id: 'booking-uuid',
      status: 'COMPLETED',
      bookingType: 'HOME_SERVICE',
      totalAmount: 45000,
      reservationCode: 'HLX-A3K9',
      reservationUsed: true,
      user: {
        id: 'user-uuid',
        firstName: 'Amara',
        lastName: 'Okafor',
        email: 'amara@example.com',
        phone: '+2348012345678',
      },
      services: [
        {
          serviceId: 'svc-uuid-1',
          name: 'Box Braids',
          price: 25000,
          duration: 180,
        },
        {
          serviceId: 'svc-uuid-2',
          name: 'Deep Conditioning',
          price: 20000,
          duration: 60,
        },
      ],
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
