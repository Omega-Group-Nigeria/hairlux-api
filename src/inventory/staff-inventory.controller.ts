import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StaffService } from '../staff/staff.service';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { RequestTransferDto } from './dto/request-transfer.dto';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';

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