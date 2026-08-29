import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { StaffService } from '../staff/staff.service';
import { VendorLedgerService } from './vendor-ledger.service';
import { CreateVendorLedgerAdjustmentDto } from './dto/create-vendor-ledger-adjustment.dto';

@ApiTags('Admin - Vendor Ledger')
@ApiBearerAuth('JWT-auth')
@Controller('admin/vendor-ledger')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminVendorLedgerController {
    constructor(
        private readonly vendorLedgerService: VendorLedgerService,
        private readonly staffService: StaffService,
    ) { }

    @Get()
    @Permission(PERMISSIONS.SUPPLIERS_READ)
    @ApiOperation({ summary: 'Every vendor with a nonzero outstanding payable or outstanding goods position' })
    async listBalances() {
        const data = await this.vendorLedgerService.listVendorBalances();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get(':vendorId')
    @Permission(PERMISSIONS.SUPPLIERS_READ)
    @ApiOperation({ summary: 'One vendor\'s full ledger -- outstanding payable, outstanding goods, and full movement history' })
    @ApiParam({ name: 'vendorId' })
    async getVendorLedger(@Param('vendorId', ParseUUIDPipe) vendorId: string) {
        const data = await this.vendorLedgerService.getVendorLedger(vendorId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post(':vendorId/adjustments')
    @Permission(PERMISSIONS.SUPPLIERS_MANAGE_LEDGER)
    @ApiOperation({ summary: "Create a manual credit/debit adjustment against a vendor's ledger" })
    @ApiParam({ name: 'vendorId' })
    async createAdjustment(@Req() req: any, @Param('vendorId', ParseUUIDPipe) vendorId: string, @Body() dto: CreateVendorLedgerAdjustmentDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.vendorLedgerService.createAdjustment(vendorId, dto, actor?.id);
        return { success: true, message: 'Adjustment recorded successfully', data };
    }
}