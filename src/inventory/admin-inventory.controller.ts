import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InventoryService } from './inventory.service';
import { StaffService } from '../staff/staff.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { RejectTransferDto } from './dto/reject-transfer.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';

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

    @Post()
    @ApiOperation({ summary: 'Create a new inventory item for a branch' })
    async create(@Body() dto: CreateInventoryItemDto & { branchId: string }) {
        const data = await this.inventoryService.createItem(dto, dto.branchId);
        return { success: true, message: 'Inventory item created successfully', data };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single inventory item' })
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.inventoryService.findOne(id);
        return { success: true, message: 'Inventory item retrieved successfully', data };
    }

    @Post(':id/adjust')
    @ApiOperation({ summary: 'Manually adjust stock quantity — requires a reason' })
    @ApiParam({ name: 'id' })
    async adjust(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustStockDto) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.adjustStock(id, dto, staff.id);
        return { success: true, message: 'Stock adjusted successfully', data };
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
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.resolveAlert(id, staff.id);
        return { success: true, message: 'Alert resolved successfully', data };
    }

    @Get('transfer-requests')
    @ApiOperation({ summary: 'List all stock transfer requests, optionally filtered by branch' })
    async findTransfers(@Query('branchId') branchId?: string) {
        const data = await this.inventoryService.findTransfers(branchId);
        return { success: true, message: 'Transfer requests retrieved successfully', data };
    }

    @Patch('transfer-requests/:id/approve')
    @ApiOperation({ summary: 'Approve a transfer — executes the stock move atomically' })
    @ApiParam({ name: 'id' })
    async approveTransfer(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.inventoryService.approveTransfer(id, staff.id);
        return { success: true, message: 'Transfer approved and executed successfully', data };
    }

    @Patch('transfer-requests/:id/reject')
    @ApiOperation({ summary: 'Reject a pending transfer request' })
    @ApiParam({ name: 'id' })
    async rejectTransfer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectTransferDto) {
        const data = await this.inventoryService.rejectTransfer(id, dto);
        return { success: true, message: 'Transfer rejected successfully', data };
    }
}