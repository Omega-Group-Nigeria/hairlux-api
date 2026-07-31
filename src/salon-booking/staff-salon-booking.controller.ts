import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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

    @Post()
    @ApiOperation({ summary: 'Create a walk-in / in-salon booking' })
    async create(@Req() req: any, @Body() dto: CreateSalonBookingDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.salonBookingService.create({ ...dto, branchId: staff.locationId }, staff.id);
        return { success: true, message: 'Booking created successfully', data };
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
    @ApiOperation({ summary: "Look up a reservation by code — restricted to the logged-in staff member's own branch" })
    @ApiParam({ name: 'code' })
    async findByReservationCode(@Req() req: any, @Param('code') code: string) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.salonBookingService.findByReservationCode(code, staff.locationId);
        return { success: true, message: 'Reservation found', data };
    }

    @Get('commission')
    @ApiOperation({ summary: "Get the logged-in staff member's real commission summary — this month, all-time, monthly breakdown, and individual entries" })
    async getMyCommission(@Req() req: any) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string };
        const data = await this.salonBookingService.getMyCommissionSummary(staff.id);
        return { success: true, message: 'Commission summary retrieved successfully', data };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single booking' })
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.salonBookingService.findOne(id);
        return { success: true, message: 'Booking retrieved successfully', data };
    }

    @Post(':id/inventory-items')
    @ApiOperation({ summary: 'Add a product/inventory item to a booking before completion' })
    @ApiParam({ name: 'id' })
    async addInventoryItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSalonBookingInventoryItemDto) {
        const data = await this.salonBookingService.addInventoryItem(id, dto);
        return { success: true, message: 'Item added to booking successfully', data };
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
    @ApiOperation({ summary: 'Mark service as started' })
    @ApiParam({ name: 'id' })
    async start(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.salonBookingService.start(id);
        return { success: true, message: 'Booking marked in progress', data };
    }

    @Patch(':id/complete')
    @ApiOperation({
        summary: 'Complete a booking',
        description: 'Deducts inventory used and calculates the assigned Stylist\'s commission.',
    })
    @ApiParam({ name: 'id' })
    async complete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.salonBookingService.complete(id, staff.id);
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