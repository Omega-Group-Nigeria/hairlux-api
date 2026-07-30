import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StaffService } from '../staff/staff.service';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { RequestTransferDto } from './dto/request-transfer.dto';
import { RejectTransferDto } from './dto/reject-transfer.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { RejectStockAdjustmentDto } from './dto/reject-stock-adjustment.dto';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { ReassignApprovalDto } from '../approval/dto/reassign-approval.dto';

@ApiTags('Staff - Inventory')
@ApiBearerAuth('JWT-auth')
@Controller('staff/me/inventory-items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffInventoryController {
    constructor(
        private readonly inventoryService: InventoryService,
        private readonly staffService: StaffService,
    ) { }

    @Get()
    @ApiOperation({
        summary: 'List inventory items',
        description: 'Defaults to your own branch. Pass branchId to browse another branch\'s stock (read-only) when planning a transfer request.',
    })
    async findAll(@Req() req: any, @Query() query: QueryInventoryDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const effectiveQuery = { ...query, branchId: query.branchId || staff.locationId };
        const data = await this.inventoryService.findAll(effectiveQuery);
        return { success: true, message: 'Inventory items retrieved successfully', data };
    }

    @Post(':itemId/receive-goods')
    @ApiOperation({ summary: 'Record goods received into stock (own branch\'s items only)' })
    async receiveGoods(
        @Req() req: any,
        @Param('itemId', ParseUUIDPipe) itemId: string,
        @Body() dto: ReceiveGoodsDto,
    ) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const item = await this.inventoryService.findOne(itemId);
        if (item.branchId !== staff.locationId) {
            throw new Error('You can only receive goods for your own branch\'s items');
        }
        const data = await this.inventoryService.receiveGoods(itemId, dto, staff.id);
        return { success: true, message: 'Goods received successfully', data };
    }

    @Post(':itemId/adjust-request')
    @ApiOperation({
        summary: 'Request a stock adjustment — requires approval before it takes effect',
        description: 'Routes to your branch manager by default. Does not change stock until approved.',
    })
    async requestAdjustment(
        @Req() req: any,
        @Param('itemId', ParseUUIDPipe) itemId: string,
        @Body() dto: AdjustStockDto,
    ) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.requestStockAdjustment(itemId, dto, staff.id, false);
        return { success: true, message: 'Stock adjustment request submitted successfully', data };
    }

    @Get('adjustment-requests')
    @ApiOperation({ summary: 'View adjustment requests for your own branch' })
    async findAdjustmentRequests(@Req() req: any) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.inventoryService.findAdjustmentRequests(staff.locationId);
        return { success: true, message: 'Adjustment requests retrieved successfully', data };
    }

    @Patch('adjustment-requests/:id/approve')
    @ApiOperation({ summary: 'Approve a stock adjustment request currently assigned to me' })
    @ApiParam({ name: 'id' })
    async approveAdjustment(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.approveStockAdjustment(id, staff.id, false);
        return { success: true, message: 'Stock adjustment approved and applied successfully', data };
    }

    @Patch('adjustment-requests/:id/reject')
    @ApiOperation({ summary: 'Reject a stock adjustment request currently assigned to me' })
    @ApiParam({ name: 'id' })
    async rejectAdjustment(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectStockAdjustmentDto) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.rejectStockAdjustment(id, staff.id, false, dto.reason);
        return { success: true, message: 'Stock adjustment rejected successfully', data };
    }

    @Patch('adjustment-requests/:id/reassign')
    @ApiOperation({ summary: 'Hand a request assigned to me off to someone else (e.g. escalate to Admin)' })
    @ApiParam({ name: 'id' })
    async reassignAdjustment(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignApprovalDto) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.reassignStockAdjustment(id, staff.id, false, dto.toApproverId, dto.reason);
        return { success: true, message: 'Stock adjustment reassigned successfully', data };
    }

    @Post('transfer-requests')
    @ApiOperation({
        summary: 'Request a stock transfer between branches',
        description: 'Either branch can initiate — the branch with surplus (push) or the branch that needs stock (pull). Requires admin approval either way.',
    })
    async requestTransfer(@Req() req: any, @Body() dto: RequestTransferDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string };
        const data = await this.inventoryService.requestTransfer(dto, staff.id);
        return { success: true, message: 'Transfer request submitted successfully', data };
    }

    @Get('transfer-requests')
    @ApiOperation({ summary: 'View transfer requests involving your branch' })
    async findTransfers(@Req() req: any) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.inventoryService.findTransfers(staff.locationId);
        return { success: true, message: 'Transfer requests retrieved successfully', data };
    }

    @Patch('transfer-requests/:id/approve')
    @ApiOperation({ summary: 'Approve a transfer request currently assigned to me — executes the stock move atomically' })
    @ApiParam({ name: 'id' })
    async approveTransfer(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.approveTransfer(id, staff.id, false);
        return { success: true, message: 'Transfer approved and executed successfully', data };
    }

    @Patch('transfer-requests/:id/reject')
    @ApiOperation({ summary: 'Reject a transfer request currently assigned to me' })
    @ApiParam({ name: 'id' })
    async rejectTransfer(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectTransferDto) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.rejectTransfer(id, staff.id, false, dto);
        return { success: true, message: 'Transfer rejected successfully', data };
    }

    @Patch('transfer-requests/:id/reassign')
    @ApiOperation({ summary: 'Hand a transfer request assigned to me off to someone else (e.g. escalate to Admin)' })
    @ApiParam({ name: 'id' })
    async reassignTransfer(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignApprovalDto) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.reassignTransfer(id, staff.id, false, dto.toApproverId, dto.reason);
        return { success: true, message: 'Transfer reassigned successfully', data };
    }

    @Get('branches')
    @ApiOperation({ summary: 'List active branches (for the transfer-request branch picker)' })
    async listBranches() {
        const data = await this.inventoryService.listBranches();
        return { success: true, message: 'Branches retrieved successfully', data };
    }

    @Post()
    @ApiOperation({ summary: 'Create a new inventory item for your own branch' })
    async create(@Req() req: any, @Body() dto: CreateInventoryItemDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.inventoryService.createItem(dto, staff.locationId);
        return { success: true, message: 'Inventory item created successfully', data };
    }
}