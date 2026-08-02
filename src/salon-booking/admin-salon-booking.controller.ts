import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'; 
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StaffService } from '../staff/staff.service';
import { AddSalonBookingInventoryItemDto } from './dto/add-inventory-item.dto';
import { CancelSalonBookingDto } from './dto/cancel-salon-booking.dto';
import { ConfirmReservationDto } from './dto/confirm-reservation.dto';
import { CreateSalonBookingDto } from './dto/create-salon-booking.dto';
import { QuerySalonBookingsDto } from './dto/query-salon-bookings.dto';
import { VerifyReservationDto } from './dto/verify-reservation.dto';
import { SalonBookingService } from './salon-booking.service';

@ApiTags('Admin - Salon Bookings')
@ApiBearerAuth('JWT-auth')
@Controller('admin/salon-bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminSalonBookingController {
    constructor(
        private readonly salonBookingService: SalonBookingService,
        private readonly staffService: StaffService,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Create a walk-in / in-salon booking' })
    async create(@Req() req: any, @Body() dto: CreateSalonBookingDto) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.salonBookingService.create(dto, staff?.id);
        return { success: true, message: 'Booking created successfully', data };
    }
    @Get()
    @ApiOperation({ summary: 'List bookings, filterable by branch/staff/status/date' })
    async findAll(@Query() query: QuerySalonBookingsDto) {
        const data = await this.salonBookingService.findAll(query);
        return { success: true, message: 'Bookings retrieved successfully', data };
    }

    @Get('verify/:code')
    @ApiOperation({ summary: 'Look up a reservation by code — any branch. Checks both SalonBooking and the legacy marketplace Booking table (still the live path for customer self-service bookings).' })
    @ApiParam({ name: 'code' })
    async findByReservationCode(@Param('code') code: string) {
        const data = await this.salonBookingService.findReservationAnywhere(code);
        return { success: true, message: 'Reservation found', data };
    }

    @Patch('verify/:code/confirm')
    @ApiOperation({
        summary: 'Verify a reservation by code — any branch',
        description: 'Works for a reservation found in either table. For SalonBooking, pass assignedStaffId. For a legacy Booking-table WALK_IN reservation, no staff assignment is needed.',
    })
    @ApiParam({ name: 'code' })
    async confirmVerificationByCode(@Param('code') code: string, @Body() dto: ConfirmReservationDto) {
        const data = await this.salonBookingService.verifyReservationAnywhere(code, dto.assignedStaffId);
        return { success: true, message: 'Reservation verified successfully', data };
    }

    @Get('overview')
    @ApiOperation({
        summary: 'Combined Salon Bookings overview — summary cards + a merged list',
        description: 'Merges SalonBooking with the legacy Booking table\'s WALK_IN entries (still the live customer self-service path), filterable by date range, branch, and source.',
    })
    async getOverview(
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('branchId') branchId?: string,
        @Query('source') source?: 'salon_booking' | 'booking' | 'all',
    ) {
        const data = await this.salonBookingService.getOverview({ dateFrom, dateTo, branchId, source });
        return { success: true, message: 'Overview retrieved successfully', data };
    }

    @Get('customers')
    @ApiOperation({ summary: 'Full paginated Customer Contacts list (Contacts module), optionally searchable by name/phone' })
    async findAllCustomers(@Query('q') q?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
        const data = await this.salonBookingService.findAllCustomers(q, page ? Number(page) : undefined, limit ? Number(limit) : undefined);
        return { success: true, message: 'Customers retrieved successfully', data };
    }

    @Get('customers/search')
    @ApiOperation({ summary: 'Look up existing customers by name or phone, for prefilling a new booking' })
    async searchCustomers(@Query('q') q?: string) {
        const data = await this.salonBookingService.searchCustomers(q ?? '');
        return { success: true, message: 'Customers retrieved successfully', data };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single booking' })
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.salonBookingService.findOne(id);
        return { success: true, message: 'Booking retrieved successfully', data };
    }

    @Delete(':id')
    @Roles(UserRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Permanently delete a Salon Booking — Super Admin only. Cascades to its service lines, inventory lines, and commission record.' })
    @ApiParam({ name: 'id' })
    async deleteBooking(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.salonBookingService.deleteBooking(id);
        return { success: true, message: 'Booking deleted successfully', data };
    }

    @Post(':id/inventory-items')
    @ApiOperation({ summary: 'Add a product/inventory item to a booking before completion' })
    @ApiParam({ name: 'id' })
    async addInventoryItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSalonBookingInventoryItemDto) {
        const data = await this.salonBookingService.addInventoryItem(id, dto);
        return { success: true, message: 'Item added to booking successfully', data };
    }

    @Patch(':id/verify')
    @ApiOperation({ summary: 'Verify a reservation — assign a Stylist and mark it redeemed' })
    @ApiParam({ name: 'id' })
    async verifyReservation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyReservationDto) {
        const data = await this.salonBookingService.verifyReservation(id, dto);
        return { success: true, message: 'Reservation verified successfully', data };
    }

    @Patch(':id/start')
    @ApiOperation({ summary: 'Mark service as started' })
    @ApiParam({ name: 'id' })
    async start(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.salonBookingService.start(id);
        return { success: true, message: 'Booking marked in progress', data };
    }

    @Patch(':id/complete')
    @ApiOperation({
        summary: 'Complete a booking',
        description: 'Deducts inventory used and calculates the assigned Stylist\'s commission — the single trigger point for both.',
    })
    @ApiParam({ name: 'id' })
    async complete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.salonBookingService.complete(id, staff?.id);
        return { success: true, message: 'Booking completed successfully', data };
    }

    @Patch(':id/cancel')
    @ApiOperation({ summary: 'Cancel a booking' })
    @ApiParam({ name: 'id' })
    async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSalonBookingDto) {
        const data = await this.salonBookingService.cancel(id, dto);
        return { success: true, message: 'Booking cancelled successfully', data };
    }

    @Patch(':id/no-show')
    @ApiOperation({ summary: 'Mark a booking as a no-show' })
    @ApiParam({ name: 'id' })
    async noShow(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSalonBookingDto) {
        const data = await this.salonBookingService.markNoShow(id, dto);
        return { success: true, message: 'Booking marked as no-show', data };
    }
}