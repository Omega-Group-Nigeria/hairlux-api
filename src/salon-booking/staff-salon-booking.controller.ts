import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StaffService } from '../staff/staff.service';
import { AddSalonBookingInventoryItemDto } from './dto/add-inventory-item.dto';
import { CancelSalonBookingDto } from './dto/cancel-salon-booking.dto';
import { CreateSalonBookingDto } from './dto/create-salon-booking.dto';
import { VerifyReservationDto } from './dto/verify-reservation.dto';
import { ConfirmReservationDto } from './dto/confirm-reservation.dto';
import { EditSalonBookingDto, AddServiceToCompletedBookingDto } from './dto/edit-salon-booking.dto';
import { SalonBookingService } from './salon-booking.service';

@ApiTags('Staff - Salon Bookings')
@ApiBearerAuth('JWT-auth')
@Controller('staff/me/salon-bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffSalonBookingController {
    constructor(
        private readonly salonBookingService: SalonBookingService,
        private readonly staffService: StaffService,
    ) { }

    /**
     * create(), findAll(), and the verify* endpoints already correctly
     * restrict to the caller's own branch. Every single-booking action
     * below (findOne, start, complete, cancel, no-show, inventory,
     * edit, add-service) previously called straight through to the shared
     * service with no branch check at all — a staff member could view or
     * act on a booking belonging to a different branch if they had (or
     * guessed) its ID. This closes that gap in one place, reused by every
     * endpoint below. Throws NotFoundException rather than Forbidden,
     * matching the existing verify-endpoint pattern, so a staff member
     * can't even confirm a booking exists at another branch.
     */
    private async assertOwnBranch(branchId: string, bookingId: string) {
        const booking = await this.salonBookingService.findOne(bookingId);
        if (booking.branchId !== branchId) {
            throw new NotFoundException('Booking not found');
        }
        return booking;
    }

    @Post()
    @ApiOperation({ summary: 'Create a walk-in / in-salon booking' })
    async create(@Req() req: any, @Body() dto: CreateSalonBookingDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.salonBookingService.create({ ...dto, branchId: staff.locationId }, staff.id);
        return { success: true, message: 'Booking created successfully', data };
    }

    @Get('preview-discount')
    @ApiOperation({ summary: 'Preview a coupon\'s discount amount before creating the booking -- Dev Feedback Round 6, item #15' })
    async previewDiscount(
        @Req() req: any,
        @Query('code') code: string,
        @Query('subtotal') subtotal: string,
        @Query('customerId') customerId?: string,
    ) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { locationId: string };
        const data = await this.salonBookingService.previewDiscount(code, staff.locationId, customerId, Number(subtotal));
        return { success: true, message: 'Discount is valid', data };
    }

    @Get('branch-staff')
    @ApiOperation({ summary: "List active staff at the logged-in staff member's own branch — for the Stylist picker" })
    async listBranchStaff(@Req() req: any) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const result: any = await this.staffService.findAll({ locationId: staff.locationId, limit: 100 } as any);
        return { success: true, message: 'Branch staff retrieved successfully', data: result.data || result };
    }

    @Get()
    @ApiOperation({ summary: "List bookings for the logged-in staff member's own branch" })
    async findAll(@Req() req: any, @Query('status') status?: string, @Query('date') date?: string) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.salonBookingService.findAll({ branchId: staff.locationId, status, date });
        return { success: true, message: 'Bookings retrieved successfully', data };
    }

    @Get('verify/:code')
    @ApiOperation({ summary: "Look up a reservation by code — restricted to the logged-in staff member's own branch. Checks both SalonBooking and the legacy marketplace Booking table (still the live path for customer self-service bookings)." })
    @ApiParam({ name: 'code' })
    async findByReservationCode(@Req() req: any, @Param('code') code: string) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.salonBookingService.findReservationAnywhere(code, staff.locationId);
        return { success: true, message: 'Reservation found', data };
    }

    @Patch('verify/:code/confirm')
    @ApiOperation({
        summary: 'Verify a reservation by code for your own branch',
        description: 'Works for a reservation found in either table. For SalonBooking, pass assignedStaffId to say who is serving the customer. For a legacy Booking-table WALK_IN reservation, no staff assignment is needed — it just gets marked used.',
    })
    @ApiParam({ name: 'code' })
    async confirmVerificationByCode(@Req() req: any, @Param('code') code: string, @Body() dto: ConfirmReservationDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.salonBookingService.verifyReservationAnywhere(code, dto.assignedStaffId, staff.locationId);
        return { success: true, message: 'Reservation verified successfully', data };
    }

    @Get('commission')
    @ApiOperation({ summary: "Get the logged-in staff member's real commission summary — this month, all-time, monthly breakdown, and individual entries" })
    async getMyCommission(@Req() req: any) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string };
        const data = await this.salonBookingService.getMyCommissionSummary(staff.id);
        return { success: true, message: 'Commission summary retrieved successfully', data };
    }

    @Get('customers/search')
    @ApiOperation({ summary: 'Look up existing customers by name or phone, for prefilling a new booking' })
    async searchCustomers(@Query('q') q?: string) {
        const data = await this.salonBookingService.searchCustomers(q ?? '');
        return { success: true, message: 'Customers retrieved successfully', data };
    }

    @Get('customers/check-phone')
    @ApiOperation({
        summary: 'Check whether a phone matches a verified account, before creating a booking',
        description: 'Call as staff enters/confirms the customer phone field. hasMatch:true means show an "Is this <accountName>? Link this visit to their account?" prompt.',
    })
    async checkPhoneMatch(@Query('phone') phone: string) {
        const data = await this.salonBookingService.checkPhoneMatch(phone);
        return { success: true, message: 'Checked successfully', data };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single booking — restricted to your own branch' })
    @ApiParam({ name: 'id' })
    async findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.assertOwnBranch(staff.locationId, id);
        return { success: true, message: 'Booking retrieved successfully', data };
    }

    @Post(':id/inventory-items')
    @ApiOperation({ summary: 'Add a product/inventory item to a booking before completion — restricted to your own branch' })
    @ApiParam({ name: 'id' })
    async addInventoryItem(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSalonBookingInventoryItemDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        await this.assertOwnBranch(staff.locationId, id);
        const data = await this.salonBookingService.addInventoryItem(id, dto);
        return { success: true, message: 'Item added to booking successfully', data };
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Edit a booking — Scheduled or In Progress only, restricted to your own branch' })
    @ApiParam({ name: 'id' })
    async editBooking(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditSalonBookingDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        await this.assertOwnBranch(staff.locationId, id);
        const data = await this.salonBookingService.editBooking(id, dto);
        return { success: true, message: 'Booking updated successfully', data };
    }

    @Post(':id/add-service')
    @ApiOperation({ summary: 'Add an additional service to a Completed booking — restricted to your own branch' })
    @ApiParam({ name: 'id' })
    async addServiceToCompletedBooking(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddServiceToCompletedBookingDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        await this.assertOwnBranch(staff.locationId, id);
        const data = await this.salonBookingService.addServiceToCompletedBooking(id, dto);
        return { success: true, message: 'Service added successfully', data };
    }

    @Get('performance/today')
    @ApiOperation({ summary: "Today's Stylist Performance for your own branch — completed services and total generated, today only" })
    async getTodayStylistPerformance(@Req() req: any) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.salonBookingService.getTodayStylistPerformance(staff.locationId);
        return { success: true, message: 'Performance retrieved successfully', data };
    }

    @Patch(':id/verify')
    @ApiOperation({ summary: "Verify a reservation for your own branch — assign a Stylist and mark it redeemed" })
    @ApiParam({ name: 'id' })
    async verifyReservation(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyReservationDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.salonBookingService.verifyReservation(id, dto, staff.locationId);
        return { success: true, message: 'Reservation verified successfully', data };
    }

    @Patch(':id/start')
    @ApiOperation({ summary: 'Mark service as started — restricted to your own branch' })
    @ApiParam({ name: 'id' })
    async start(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        await this.assertOwnBranch(staff.locationId, id);
        const data = await this.salonBookingService.start(id);
        return { success: true, message: 'Booking marked in progress', data };
    }

    @Patch(':id/complete')
    @ApiOperation({
        summary: 'Complete a booking — restricted to your own branch',
        description: 'Deducts inventory used and calculates the assigned Stylist\'s commission.',
    })
    @ApiParam({ name: 'id' })
    async complete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        await this.assertOwnBranch(staff.locationId, id);
        const data = await this.salonBookingService.complete(id, staff.id);
        return { success: true, message: 'Booking completed successfully', data };
    }

    @Patch(':id/cancel')
    @ApiOperation({ summary: 'Cancel a booking — Scheduled only, restricted to your own branch' })
    @ApiParam({ name: 'id' })
    async cancel(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSalonBookingDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        await this.assertOwnBranch(staff.locationId, id);
        const data = await this.salonBookingService.cancel(id, dto);
        return { success: true, message: 'Booking cancelled successfully', data };
    }

    @Patch(':id/no-show')
    @ApiOperation({ summary: 'Mark a booking as a no-show — restricted to your own branch' })
    @ApiParam({ name: 'id' })
    async noShow(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSalonBookingDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        await this.assertOwnBranch(staff.locationId, id);
        const data = await this.salonBookingService.markNoShow(id, dto);
        return { success: true, message: 'Booking marked as no-show', data };
    }
}