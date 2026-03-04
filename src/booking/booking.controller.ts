import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';
import { Public } from '../auth/decorators/public.decorator';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('business-hours')
  @Public()
  @ApiOperation({
    summary: 'Get weekly business hours',
    description:
      'Returns the configured open/close times for each day of the week. Public endpoint, no authentication required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Business hours retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Business hours retrieved successfully',
        data: [
          {
            id: 'uuid',
            dayOfWeek: 0,
            openTime: '09:00',
            closeTime: '17:00',
            isOpen: true,
          },
          {
            id: 'uuid',
            dayOfWeek: 1,
            openTime: '09:00',
            closeTime: '17:00',
            isOpen: true,
          },
        ],
      },
    },
  })
  async getBusinessHours() {
    const data = await this.bookingService.getBusinessHours();
    return {
      success: true,
      message: 'Business hours retrieved successfully',
      data,
    };
  }

  @Get('business-exceptions')
  @Public()
  @ApiOperation({
    summary: 'Get all business exceptions',
    description:
      'Returns all date-specific overrides (holidays, special hours, emergency closures). Public endpoint, no authentication required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Exceptions retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Business exceptions retrieved successfully',
        data: [
          {
            id: 'uuid',
            date: '2026-12-25T00:00:00.000Z',
            isClosed: true,
            openTime: null,
            closeTime: null,
            reason: 'Christmas Holiday',
          },
        ],
      },
    },
  })
  async getBusinessExceptions() {
    const data = await this.bookingService.getBusinessExceptions();
    return {
      success: true,
      message: 'Business exceptions retrieved successfully',
      data,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create and pay for a booking',
    description:
      'Book one or more services in a single appointment. All services are stored under ONE booking record with a single reservation code. ' +
      '`bookingType` must be `HOME_SERVICE` (requires `addressId` — stylist visits you) or `WALK_IN` (in-store, no address needed). ' +
      'Payment: WALLET deducts the full total from your wallet immediately — booking is only created if balance is sufficient. ' +
      'CASH: slot is reserved and payment is collected on the day.',
  })
  @ApiResponse({
    status: 201,
    description: 'Booking created and payment processed',
    schema: {
      example: {
        success: true,
        message: 'Payment successful. Booking confirmed.',
        data: {
          booking: {
            id: '123e4567-e89b-12d3-a456-426614174010',
            status: 'CONFIRMED',
            bookingType: 'HOME_SERVICE',
            bookingDate: '2026-02-15T14:00:00.000Z',
            bookingTime: '14:00',
            totalAmount: 45000,
            reservationCode: 'HLX-A3K9',
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
              addressLine: '15 Lekki Phase 1',
              city: 'Lagos',
            },
          },
          reservationCode: 'HLX-A3K9',
          totalAmount: 45000,
          paymentMethod: 'WALLET',
          message: 'Payment successful. Booking confirmed.',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Insufficient wallet balance, service unavailable, or invalid data',
  })
  @ApiResponse({
    status: 404,
    description: 'Service, Address, or Wallet not found',
  })
  @ApiResponse({ status: 409, description: 'Time slot already booked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @GetUser('id') userId: string,
    @Body() createBookingDto: CreateBookingDto,
  ) {
    const data = await this.bookingService.create(userId, createBookingDto);
    return {
      success: true,
      message: data.message,
      data,
    };
  }

  @Get('user')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Get user's bookings",
    description: 'Retrieve all bookings for the authenticated user',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
    enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter from date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter to date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Bookings retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Bookings retrieved successfully',
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174010',
            date: '2026-02-15T00:00:00.000Z',
            time: '14:00',
            amount: 25000,
            status: 'CONFIRMED',
            service: {
              id: '123e4567-e89b-12d3-a456-426614174001',
              name: 'Box Braids',
              price: 25000,
              duration: 180,
            },
          },
        ],
      },
    },
  })
  async findUserBookings(
    @GetUser('id') userId: string,
    @Query() queryDto: QueryBookingsDto,
  ) {
    const bookings = await this.bookingService.findUserBookings(
      userId,
      queryDto,
    );
    return {
      success: true,
      message: 'Bookings retrieved successfully',
      data: bookings,
    };
  }

  @Get('reservation/:code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Look up your booking by reservation code',
    description:
      'Returns booking details for the given reservation code. ' +
      'Only returns the booking if it belongs to the authenticated user.',
  })
  @ApiParam({
    name: 'code',
    description: 'Reservation code (e.g. HLX-A3K9)',
    example: 'HLX-A3K9',
  })
  @ApiResponse({ status: 200, description: 'Booking retrieved successfully' })
  @ApiResponse({
    status: 403,
    description: 'Reservation does not belong to you',
  })
  @ApiResponse({ status: 404, description: 'Reservation code not found' })
  async findByReservationCode(
    @Param('code') code: string,
    @GetUser('id') userId: string,
  ) {
    const data = await this.bookingService.findByReservationCode(code, userId);
    return { success: true, message: 'Booking retrieved successfully', data };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get booking details',
    description: 'Retrieve detailed information about a specific booking',
  })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({
    status: 200,
    description: 'Booking retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Booking retrieved successfully',
        data: {
          id: '123e4567-e89b-12d3-a456-426614174010',
          userId: 'clx0987654321',
          serviceId: '123e4567-e89b-12d3-a456-426614174001',
          addressId: '123e4567-e89b-12d3-a456-426614174002',
          bookingDate: '2026-02-25T10:30:00.000Z',
          bookingTime: '10:30',
          totalAmount: 25000,
          status: 'CONFIRMED',
          paymentMethod: 'WALLET',
          notes: 'Please bring extension hair',
          cancelReason: null,
          createdAt: '2026-02-24T09:00:00.000Z',
          updatedAt: '2026-02-24T09:00:00.000Z',
          service: {
            id: '123e4567-e89b-12d3-a456-426614174001',
            name: 'Braiding Service',
            description: 'Full head braiding with styling',
            price: 25000,
            duration: 120,
          },
          address: {
            id: '123e4567-e89b-12d3-a456-426614174002',
            addressLine: '15 Lekki Phase 1',
            city: 'Lagos',
            state: 'Lagos',
            country: 'Nigeria',
            latitude: 6.4541,
            longitude: 3.3947,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findOne(@Param('id') id: string, @GetUser('id') userId: string) {
    const booking = await this.bookingService.findOne(id, userId);
    return {
      success: true,
      message: 'Booking retrieved successfully',
      data: booking,
    };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Reschedule booking',
    description: 'Change the date and time of an existing booking',
  })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({
    status: 200,
    description: 'Booking rescheduled successfully',
  })
  @ApiResponse({ status: 400, description: 'Cannot reschedule this booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 409, description: 'New time slot is not available' })
  async reschedule(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Body() rescheduleDto: RescheduleBookingDto,
  ) {
    const booking = await this.bookingService.reschedule(
      id,
      userId,
      rescheduleDto,
    );
    return {
      success: true,
      message: 'Booking rescheduled successfully',
      data: booking,
    };
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update booking status',
    description: 'Cancel a booking (users can only cancel)',
  })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({
    status: 200,
    description: 'Booking status updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot update status of this booking',
  })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({
    status: 403,
    description: 'Users can only cancel bookings',
  })
  async updateStatus(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Body() updateStatusDto: UpdateBookingStatusDto,
  ) {
    const booking = await this.bookingService.updateStatus(
      id,
      userId,
      updateStatusDto.status,
      updateStatusDto.reason,
    );
    return {
      success: true,
      message:
        'Booking cancelled successfully. Refund processed if applicable.',
      data: booking,
    };
  }
}
