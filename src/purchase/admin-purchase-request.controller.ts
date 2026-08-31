import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PurchaseRequestStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { StaffService } from '../staff/staff.service';
import { PurchaseRequestService } from './purchase-request.service';
import { UpsertPurchaseRequestDto } from './dto/upsert-purchase-request.dto';
import { CreatePurchaseRequestFromAlertsDto } from './dto/create-purchase-request-from-alerts.dto';

@ApiTags('Admin - Purchase Requests')
@ApiBearerAuth('JWT-auth')
@Controller('admin/purchase-requests')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class AdminPurchaseRequestController {
    constructor(
        private readonly purchaseRequestService: PurchaseRequestService,
        private readonly staffService: StaffService,
    ) { }

    /**
     * req.user.id is a User.id (from the JWT) -- every field this
     * controller ultimately writes to (PurchaseRequest.requestedById,
     * ApprovalRequest.submittedById/actorId) is a Staff.id instead, so
     * it's resolved here via the acting admin's own linked Staff record,
     * same pattern as StaffCompensationHistory.changedById and
     * StaffAddressVerification.requestedById elsewhere in this codebase.
     * A pure admin account with no Staff record correctly resolves to
     * undefined, which every downstream field already treats as valid
     * ("admin-initiated with no linked staff record").
     */
    private async resolveActingStaffId(userId: string): Promise<string | undefined> {
        const staff = await this.staffService.findByUserIdOrNull(userId);
        return (staff as unknown as { id: string } | null)?.id;
    }

    @Get()
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_READ)
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'vendorId', required: false })
    @ApiQuery({ name: 'status', required: false, enum: PurchaseRequestStatus })
    async findAll(
        @Query('branchId') branchId?: string,
        @Query('vendorId') vendorId?: string,
        @Query('status') status?: PurchaseRequestStatus,
    ) {
        const data = await this.purchaseRequestService.findAll({ branchId, vendorId, status });
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('last-price/:productId')
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_READ)
    @ApiOperation({ summary: 'Look up the last approved purchase price for a product -- used to pre-fill a new request line' })
    @ApiParam({ name: 'productId' })
    async getLastPrice(@Param('productId') productId: string) {
        const price = await this.purchaseRequestService.getLastApprovedPrice(productId);
        return { success: true, message: 'Retrieved successfully', data: { price } };
    }

    @Get(':id')
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_READ)
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.purchaseRequestService.findOne(id);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post()
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_CREATE)
    @ApiOperation({ summary: 'Create a purchase request in Draft status' })
    async create(@Body() dto: UpsertPurchaseRequestDto, @Req() req: any) {
        const staffId = await this.resolveActingStaffId(req.user.id);
        const data = await this.purchaseRequestService.create(dto, staffId);
        return { success: true, message: 'Purchase request created', data };
    }

    @Post('from-alerts')
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_CREATE)
    @ApiOperation({
        summary: 'Push selected stock alerts into a new draft purchase request',
        description: 'Procurement/Inventory/Finance Integration, Phase 7 -- "the loop that closes Inventory back to Procurement." Suggested quantity and last purchase price are pre-filled; the resulting Draft can still be reviewed and edited like any other request before submitting.',
    })
    async createFromAlerts(@Body() dto: CreatePurchaseRequestFromAlertsDto, @Req() req: any) {
        const staffId = await this.resolveActingStaffId(req.user.id);
        const data = await this.purchaseRequestService.createFromAlerts(dto, staffId);
        return { success: true, message: 'Draft purchase request created from selected alerts', data };
    }

    @Patch(':id')
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_UPDATE)
    @ApiOperation({ summary: 'Edit a purchase request -- only while it is still a Draft' })
    @ApiParam({ name: 'id' })
    async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertPurchaseRequestDto) {
        const data = await this.purchaseRequestService.update(id, dto);
        return { success: true, message: 'Purchase request updated', data };
    }

    @Delete(':id')
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_DELETE)
    @ApiOperation({ summary: 'Delete a purchase request -- Dev Feedback Round 6, item #9. Only a Draft, Rejected, or Cancelled request can be deleted.' })
    @ApiParam({ name: 'id' })
    async remove(@Param('id', ParseUUIDPipe) id: string) {
        await this.purchaseRequestService.remove(id);
        return { success: true, message: 'Purchase request deleted successfully' };
    }

    @Post(':id/submit')
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_CREATE)
    @ApiOperation({ summary: 'Submit a Draft for approval' })
    @ApiParam({ name: 'id' })
    async submit(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
        const staffId = await this.resolveActingStaffId(req.user.id);
        const data = await this.purchaseRequestService.submit(id, staffId);
        return { success: true, message: 'Purchase request submitted for approval', data };
    }

    @Post(':id/approve')
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_APPROVE)
    @ApiOperation({ summary: 'Approve the current stage -- automatically converts to a Purchase once the last configured stage approves' })
    @ApiParam({ name: 'id' })
    async approve(@Param('id', ParseUUIDPipe) id: string, @Body('comment') comment: string | undefined, @Req() req: any) {
        const isElevated = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
        const staffId = await this.resolveActingStaffId(req.user.id);
        const data = await this.purchaseRequestService.approve(id, staffId, isElevated, comment);
        return { success: true, message: 'Purchase request approved', data };
    }

    @Post(':id/reject')
    @Permission(PERMISSIONS.PURCHASE_REQUESTS_APPROVE)
    @ApiOperation({ summary: 'Reject a purchase request -- terminates the whole chain immediately, regardless of which stage it was at' })
    @ApiParam({ name: 'id' })
    async reject(@Param('id', ParseUUIDPipe) id: string, @Body('reason') reason: string | undefined, @Req() req: any) {
        const isElevated = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
        const staffId = await this.resolveActingStaffId(req.user.id);
        const data = await this.purchaseRequestService.reject(id, staffId, isElevated, reason);
        return { success: true, message: 'Purchase request rejected', data };
    }
}