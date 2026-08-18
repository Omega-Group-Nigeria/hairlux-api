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
import { UpdateCustomerClassificationSettingsDto } from './dto/update-customer-classification-settings.dto';
import { EditSalonBookingDto, AddServiceToCompletedBookingDto } from './dto/edit-salon-booking.dto';
import { SalonBookingService } from './salon-booking.service';
import type { CustomerLifecycle, CustomerValue } from '../common/utils/customer-status.util';

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
    @ApiOperation({ summary: 'Full paginated Customer Contacts list (Contacts module) — searchable and filterable by branch, activity, spending, service, and lifecycle status' })
    async findAllCustomers(
        @Query('q') q?: string,
        @Query('branchIds') branchIds?: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('hasAccount') hasAccount?: string,
        @Query('minVisits') minVisits?: string,
        @Query('maxVisits') maxVisits?: string,
        @Query('minSpend') minSpend?: string,
        @Query('maxSpend') maxSpend?: string,
        @Query('minAvgSpend') minAvgSpend?: string,
        @Query('maxAvgSpend') maxAvgSpend?: string,
        @Query('firstVisitFrom') firstVisitFrom?: string,
        @Query('firstVisitTo') firstVisitTo?: string,
        @Query('lastVisitFrom') lastVisitFrom?: string,
        @Query('lastVisitTo') lastVisitTo?: string,
        @Query('daysSinceLastVisitMin') daysSinceLastVisitMin?: string,
        @Query('daysSinceLastVisitMax') daysSinceLastVisitMax?: string,
        @Query('lifecycle') lifecycle?: CustomerLifecycle,
        @Query('value') value?: CustomerValue,
        @Query('serviceCategoryIds') serviceCategoryIds?: string,
        @Query('serviceIds') serviceIds?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const data = await this.salonBookingService.findAllCustomers({
            query: q,
            branchIds: branchIds ? branchIds.split(',') : undefined,
            dateFrom,
            dateTo,
            hasAccount: hasAccount === undefined ? undefined : hasAccount === 'true',
            minVisits: minVisits ? Number(minVisits) : undefined,
            maxVisits: maxVisits ? Number(maxVisits) : undefined,
            minSpend: minSpend ? Number(minSpend) : undefined,
            maxSpend: maxSpend ? Number(maxSpend) : undefined,
            minAvgSpend: minAvgSpend ? Number(minAvgSpend) : undefined,
            maxAvgSpend: maxAvgSpend ? Number(maxAvgSpend) : undefined,
            firstVisitFrom, firstVisitTo, lastVisitFrom, lastVisitTo,
            daysSinceLastVisitMin: daysSinceLastVisitMin ? Number(daysSinceLastVisitMin) : undefined,
            daysSinceLastVisitMax: daysSinceLastVisitMax ? Number(daysSinceLastVisitMax) : undefined,
            lifecycle,
            value,
            serviceCategoryIds: serviceCategoryIds ? serviceCategoryIds.split(',') : undefined,
            serviceIds: serviceIds ? serviceIds.split(',') : undefined,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
        return { success: true, message: 'Customers retrieved successfully', data };
    }

    @Get('customers/performance')
    @ApiOperation({ summary: 'Performance cards for the Customer Contacts page — computed over the same filters as the customer list, so cards and table always agree' })
    async getCustomerContactsPerformance(
        @Query('q') q?: string,
        @Query('branchIds') branchIds?: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('hasAccount') hasAccount?: string,
        @Query('minVisits') minVisits?: string,
        @Query('maxVisits') maxVisits?: string,
        @Query('minSpend') minSpend?: string,
        @Query('maxSpend') maxSpend?: string,
        @Query('minAvgSpend') minAvgSpend?: string,
        @Query('maxAvgSpend') maxAvgSpend?: string,
        @Query('firstVisitFrom') firstVisitFrom?: string,
        @Query('firstVisitTo') firstVisitTo?: string,
        @Query('lastVisitFrom') lastVisitFrom?: string,
        @Query('lastVisitTo') lastVisitTo?: string,
        @Query('daysSinceLastVisitMin') daysSinceLastVisitMin?: string,
        @Query('daysSinceLastVisitMax') daysSinceLastVisitMax?: string,
        @Query('lifecycle') lifecycle?: CustomerLifecycle,
        @Query('value') value?: CustomerValue,
        @Query('serviceCategoryIds') serviceCategoryIds?: string,
        @Query('serviceIds') serviceIds?: string,
    ) {
        const data = await this.salonBookingService.getCustomerContactsPerformance({
            query: q,
            branchIds: branchIds ? branchIds.split(',') : undefined,
            dateFrom,
            dateTo,
            hasAccount: hasAccount === undefined ? undefined : hasAccount === 'true',
            minVisits: minVisits ? Number(minVisits) : undefined,
            maxVisits: maxVisits ? Number(maxVisits) : undefined,
            minSpend: minSpend ? Number(minSpend) : undefined,
            maxSpend: maxSpend ? Number(maxSpend) : undefined,
            minAvgSpend: minAvgSpend ? Number(minAvgSpend) : undefined,
            maxAvgSpend: maxAvgSpend ? Number(maxAvgSpend) : undefined,
            firstVisitFrom, firstVisitTo, lastVisitFrom, lastVisitTo,
            daysSinceLastVisitMin: daysSinceLastVisitMin ? Number(daysSinceLastVisitMin) : undefined,
            daysSinceLastVisitMax: daysSinceLastVisitMax ? Number(daysSinceLastVisitMax) : undefined,
            lifecycle,
            value,
            serviceCategoryIds: serviceCategoryIds ? serviceCategoryIds.split(',') : undefined,
            serviceIds: serviceIds ? serviceIds.split(',') : undefined,
        });
        return { success: true, message: 'Performance retrieved successfully', data };
    }

    @Get('customers/:id/profile')
    @ApiOperation({ summary: "A single customer's full profile and booking history (Customer Contacts drill-down)" })
    async getCustomerProfile(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.salonBookingService.getCustomerProfile(id);
        return { success: true, message: 'Customer profile retrieved successfully', data };
    }

    @Get('customers/classification-settings')
    @ApiOperation({
        summary: 'Get the Customer Contacts / Users lifecycle and value classification thresholds',
        description: 'Both dimensions (Lifecycle: New/Active/At Risk/Dormant/Inactive/Never Visited, and Value: Standard/Premium/VIP) live on one admin-configurable settings row.',
    })
    async getCustomerClassificationSettings() {
        const data = await this.salonBookingService.getCustomerClassificationSettings();
        return { success: true, message: 'Classification settings retrieved successfully', data };
    }

    @Patch('customers/classification-settings')
    @ApiOperation({ summary: 'Update the Customer Contacts / Users lifecycle and value classification thresholds' })
    async updateCustomerClassificationSettings(@Body() dto: UpdateCustomerClassificationSettingsDto, @Req() req: any) {
        const data = await this.salonBookingService.updateCustomerClassificationSettings(dto, req.user?.id);
        return { success: true, message: 'Classification settings updated successfully', data };
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
    @ApiOperation({ summary: 'Get a single booking' })
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.salonBookingService.findOne(id);
        return { success: true, message: 'Booking retrieved successfully', data };
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Edit a booking — Scheduled or In Progress only',
        description: 'Full edit: services, staff, date/time, customer details, notes. Re-validates date/time changes against the same past-date and business-hours-closure rules as creating a new booking. For a Completed booking, use POST :id/add-service instead — existing service lines can never be altered here.',
    })
    @ApiParam({ name: 'id' })
    async editBooking(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditSalonBookingDto) {
        const data = await this.salonBookingService.editBooking(id, dto);
        return { success: true, message: 'Booking updated successfully', data };
    }

    @Post(':id/add-service')
    @ApiOperation({
        summary: 'Add an additional service to a Completed booking',
        description: 'The only way a Completed booking can change — adds one new service line. Existing service lines on the booking are never altered or removed by this or any other endpoint.',
    })
    @ApiParam({ name: 'id' })
    async addServiceToCompletedBooking(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddServiceToCompletedBookingDto) {
        const data = await this.salonBookingService.addServiceToCompletedBooking(id, dto);
        return { success: true, message: 'Service added successfully', data };
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