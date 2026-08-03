import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupplierService } from './supplier.service';

@ApiTags('Staff - Suppliers & Vendors')
@ApiBearerAuth('JWT-auth')
@Controller('staff/me/suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffSupplierController {
    constructor(private readonly supplierService: SupplierService) { }

    @Get()
    @ApiOperation({ summary: 'List active suppliers/vendors — read-only, for picking one when logging a new inventory item' })
    async findAll() {
        const data = await this.supplierService.findAll(undefined, true);
        return { success: true, message: 'Retrieved successfully', data };
    }
}