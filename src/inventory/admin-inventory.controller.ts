import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ReassignApprovalDto } from '../approval/dto/reassign-approval.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StaffService } from '../staff/staff.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { TransferStockBetweenTypesDto } from './dto/transfer-stock-between-types.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { BulkCreateInventoryItemDto } from './dto/bulk-create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { RejectStockAdjustmentDto } from './dto/reject-stock-adjustment.dto';
import { RejectTransferDto } from './dto/reject-transfer.dto';
import { RequestTransferDto } from './dto/request-transfer.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Admin - Inventory')
@ApiBearerAuth('JWT-auth')
@Controller('admin/inventory-items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminInventoryController {
    constructor(
        private readonly inventoryService: InventoryService,
        private readonly staffService: StaffService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List inventory items across all branches, filterable' })
    async findAll(@Query() query: QueryInventoryDto) {
        const data = await this.inventoryService.findAll(query);
        return { success: true, message: 'Inventory items retrieved successfully', data };
    }

    @Post('bulk')
    @ApiOperation({ summary: 'Create the same item across multiple branches at once, with an independent starting quantity per branch' })
    async createBulk(@Body() dto: BulkCreateInventoryItemDto) {
        const data = await this.inventoryService.createItemForBranches(dto);
        return { success: true, message: 'Item created successfully', data };
    }

    @Post()
    @ApiOperation({ summary: 'Create a new inventory item for a branch' })
    async create(@Body() dto: CreateInventoryItemDto & { branchId: string }) {
        const data = await this.inventoryService.createItem(dto, dto.branchId);
        return { success: true, message: 'Inventory item created successfully', data };
    }

    // ── Static-prefix routes registered before the `:id` catch-all below —
    // otherwise Nest matches e.g. "transfer-requests" against `:id` and
    // ParseUUIDPipe rejects it with "Validation failed (uuid is expected)".
    // (This exact ordering bug already bit us once on /admin/attendance.)

    @Get('adjustment-requests')
    @ApiOperation({ summary: 'List stock adjustment requests, filterable by branch/status' })
    async findAdjustmentRequests(@Query('branchId') branchId?: string, @Query('status') status?: string) {
        const data = await this.inventoryService.findAdjustmentRequests(branchId, status);
        return { success: true, message: 'Adjustment requests retrieved successfully', data };
    }

    @Patch('adjustment-requests/:id/approve')
    @ApiOperation({ summary: 'Approve a pending stock adjustment request (Admin/Super Admin override)' })
    @ApiParam({ name: 'id' })
    async approveAdjustment(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.approveStockAdjustment(id, staff?.id, true);
        return { success: true, message: 'Stock adjustment approved and applied successfully', data };
    }

    @Patch('adjustment-requests/:id/reject')
    @ApiOperation({ summary: 'Reject a pending stock adjustment request (Admin/Super Admin override)' })
    @ApiParam({ name: 'id' })
    async rejectAdjustment(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectStockAdjustmentDto) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.rejectStockAdjustment(id, staff?.id, true, dto.reason);
        return { success: true, message: 'Stock adjustment rejected successfully', data };
    }

    @Patch('adjustment-requests/:id/reassign')
    @ApiOperation({ summary: 'Reassign a pending stock adjustment request to a different approver' })
    @ApiParam({ name: 'id' })
    async reassignAdjustment(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignApprovalDto) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.reassignStockAdjustment(id, staff?.id, true, dto.toApproverId, dto.reason);
        return { success: true, message: 'Stock adjustment reassigned successfully', data };
    }

    @Get('alerts/low-stock')
    @ApiOperation({ summary: 'List low-stock alerts, filterable by branch and resolved status' })
    async findAlerts(@Query('branchId') branchId?: string, @Query('resolved') resolved?: string) {
        const data = await this.inventoryService.findAlerts(
            branchId,
            resolved === undefined ? undefined : resolved === 'true',
        );
        return { success: true, message: 'Alerts retrieved successfully', data };
    }

    @Patch('alerts/low-stock/:id/resolve')
    @ApiOperation({ summary: 'Mark a low-stock alert resolved' })
    @ApiParam({ name: 'id' })
    async resolveAlert(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.resolveAlert(id, staff?.id);
        return { success: true, message: 'Alert resolved successfully', data };
    }

    @Get('alerts/expiry')
    @ApiOperation({ summary: 'List expiry alerts, filterable by branch and resolved status' })
    async findExpiryAlerts(@Query('branchId') branchId?: string, @Query('resolved') resolved?: string) {
        const data = await this.inventoryService.findExpiryAlerts(
            branchId,
            resolved === undefined ? undefined : resolved === 'true',
        );
        return { success: true, message: 'Expiry alerts retrieved successfully', data };
    }

    @Patch('alerts/expiry/:id/resolve')
    @ApiOperation({ summary: 'Mark an expiry alert resolved' })
    @ApiParam({ name: 'id' })
    async resolveExpiryAlert(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.resolveExpiryAlert(id, staff?.id);
        return { success: true, message: 'Expiry alert resolved successfully', data };
    }

    @Post('transfer-requests')
    @ApiOperation({
        summary: 'Request a stock transfer between branches — Dev Feedback Round 6, item #8',
        description: 'Goes through the same approval workflow as a staff-submitted request (requestTransfer has no elevated/auto-approve path) — use the separate approve endpoint below to execute it.',
    })
    async requestTransfer(@Req() req: any, @Body() dto: RequestTransferDto) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        if (!staff) {
            throw new BadRequestException('Your account has no linked staff record, so a transfer cannot be attributed to a requester — ask a Super Admin with a linked staff record to submit this instead.');
        }
        const data = await this.inventoryService.requestTransfer(dto, staff.id);
        return { success: true, message: 'Transfer request submitted successfully', data };
    }

    @Get('transfer-requests')
    @ApiOperation({ summary: 'List all stock transfer requests, optionally filtered by branch' })
    async findTransfers(@Query('branchId') branchId?: string) {
        const data = await this.inventoryService.findTransfers(branchId);
        return { success: true, message: 'Transfer requests retrieved successfully', data };
    }

    @Patch('transfer-requests/:id/approve')
    @ApiOperation({ summary: 'Approve a transfer — executes the stock move atomically (Admin/Super Admin override)' })
    @ApiParam({ name: 'id' })
    async approveTransfer(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.approveTransfer(id, staff?.id, true);
        return { success: true, message: 'Transfer approved and executed successfully', data };
    }

    @Patch('transfer-requests/:id/reject')
    @ApiOperation({ summary: 'Reject a pending transfer request (Admin/Super Admin override)' })
    @ApiParam({ name: 'id' })
    async rejectTransfer(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectTransferDto) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.rejectTransfer(id, staff?.id, true, dto);
        return { success: true, message: 'Transfer rejected successfully', data };
    }

    @Patch('transfer-requests/:id/reassign')
    @ApiOperation({ summary: 'Reassign a pending transfer request to a different approver' })
    @ApiParam({ name: 'id' })
    async reassignTransfer(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignApprovalDto) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.reassignTransfer(id, staff?.id, true, dto.toApproverId, dto.reason);
        return { success: true, message: 'Transfer reassigned successfully', data };
    }

    @Post(':id/adjust')
    @ApiOperation({
        summary: 'Adjust stock quantity — requires a reason',
        description: 'Admin/Super Admin actions are elevated and apply immediately, but still go through the same ApprovalRequest audit trail as a staff-submitted request.',
    })
    @ApiParam({ name: 'id' })
    async adjust(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustStockDto) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.requestStockAdjustment(id, dto, staff?.id, true);
        return { success: true, message: 'Stock adjusted successfully', data };
    }

    @Post(':id/transfer-stock-type')
    @ApiOperation({
        summary: 'Move quantity between Store/Sales/Usage stock at the same item/branch — Dev Feedback Round 6, item #6',
        description: 'Does not change the item\'s total stock, only how it is allocated across the three buckets. Applies immediately — no approval workflow, since nothing enters or leaves the branch.',
    })
    @ApiParam({ name: 'id' })
    async transferStockType(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferStockBetweenTypesDto) {
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.inventoryService.transferBetweenStockTypes(id, dto.fromStockType, dto.toStockType, dto.quantity, dto.reason, staff?.id);
        return { success: true, message: 'Stock reallocated successfully', data };
    }

    @Get('movements/all')
    @ApiOperation({ summary: 'Full stock movement log across every item — receipts, sales, adjustments, transfers — optionally filtered by branch or type' })
    async getAllMovements(
        @Query('branchId') branchId?: string,
        @Query('type') type?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const data = await this.inventoryService.getAllMovements({
            branchId,
            type,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
        return { success: true, message: 'Movement log retrieved successfully', data };
    }

    @Get(':id/movements')
    @ApiOperation({ summary: 'Full movement history for a single item — receipts, sales, adjustments, transfers in/out' })
    @ApiParam({ name: 'id' })
    async getItemMovements(@Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
        const data = await this.inventoryService.getMovementHistory(id, page ? Number(page) : undefined, limit ? Number(limit) : undefined);
        return { success: true, message: 'Movement history retrieved successfully', data };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single inventory item' })
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.inventoryService.findOne(id);
        return { success: true, message: 'Inventory item retrieved successfully', data };
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update an inventory item — name, category, unit, threshold, expiry, price' })
    @ApiParam({ name: 'id' })
    async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInventoryItemDto) {
        const data = await this.inventoryService.updateItem(id, dto);
        return { success: true, message: 'Inventory item updated successfully', data };
    }
}