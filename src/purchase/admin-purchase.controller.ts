import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PurchaseStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { StaffService } from '../staff/staff.service';
import { PurchaseService } from './purchase.service';
import { RecordPurchasePaymentDto } from './dto/record-purchase-payment.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { AcceptGoodsDto } from './dto/accept-goods.dto';

@ApiTags('Admin - Purchases')
@ApiBearerAuth('JWT-auth')
@Controller('admin/purchases')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class AdminPurchaseController {
    constructor(
        private readonly purchaseService: PurchaseService,
        private readonly staffService: StaffService,
    ) { }

    /** Same reasoning as AdminPurchaseRequestController's identical helper -- req.user.id is a User.id, every field here is a Staff.id. */
    private async resolveActingStaffId(userId: string): Promise<string | undefined> {
        const staff = await this.staffService.findByUserIdOrNull(userId);
        return (staff as unknown as { id: string } | null)?.id;
    }

    @Get()
    @Permission(PERMISSIONS.PURCHASES_READ)
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'vendorId', required: false })
    @ApiQuery({ name: 'status', required: false, enum: PurchaseStatus })
    @ApiQuery({ name: 'search', required: false, description: 'Purchase number, e.g. "123" or "PO-2026-000123" -- Dev Feedback Round 7, item #4' })
    @ApiQuery({ name: 'from', required: false, description: 'ISO date string, filters by purchaseDate' })
    @ApiQuery({ name: 'to', required: false, description: 'ISO date string, filters by purchaseDate' })
    async findAll(
        @Query('branchId') branchId?: string,
        @Query('vendorId') vendorId?: string,
        @Query('status') status?: PurchaseStatus,
        @Query('search') search?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        const data = await this.purchaseService.findAll({
            branchId, vendorId, status, search,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
        });
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get(':id')
    @Permission(PERMISSIONS.PURCHASES_READ)
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.purchaseService.findOne(id);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post(':id/payments')
    @Permission(PERMISSIONS.PURCHASES_RECORD_PAYMENT)
    @ApiOperation({ summary: 'Record a payment made to the vendor -- automatically creates a matching outflow in the Financial Transaction ledger' })
    @ApiParam({ name: 'id' })
    async recordPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordPurchasePaymentDto, @Req() req: any) {
        const staffId = await this.resolveActingStaffId(req.user.id);
        const data = await this.purchaseService.recordPayment(id, dto, staffId);
        return { success: true, message: 'Payment recorded', data };
    }

    @Post(':id/receive')
    @Permission(PERMISSIONS.PURCHASES_RECEIVE_GOODS)
    @ApiOperation({ summary: 'Confirm a delivery against this purchase -- just records what arrived (delivered/damaged). Nothing enters inventory until it is separately accepted via /accept-goods. Supports multiple partial deliveries.' })
    @ApiParam({ name: 'id' })
    async receiveGoods(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveGoodsDto, @Req() req: any) {
        const staffId = await this.resolveActingStaffId(req.user.id);
        const data = await this.purchaseService.receiveGoods(id, dto, staffId);
        return { success: true, message: 'Goods receipt recorded', data };
    }

    @Post(':id/accept-goods')
    @Permission(PERMISSIONS.PURCHASES_ACCEPT_GOODS)
    @ApiOperation({ summary: 'Product Acceptance -- review specific still-pending goods receipt lines and accept whatever quantity is actually usable into inventory (Store Stock). Each receipt line can only be reviewed once.' })
    @ApiParam({ name: 'id' })
    async acceptGoods(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AcceptGoodsDto, @Req() req: any) {
        const staffId = await this.resolveActingStaffId(req.user.id);
        const data = await this.purchaseService.acceptGoods(id, dto, staffId);
        return { success: true, message: 'Products accepted', data };
    }
}