import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierService } from './supplier.service';

@ApiTags('Admin - Suppliers & Vendors')
@ApiBearerAuth('JWT-auth')
@Controller('admin/suppliers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class SupplierController {
    constructor(private readonly supplierService: SupplierService) { }

    @Post()
    @Permission(PERMISSIONS.SUPPLIERS_CREATE)
    @ApiOperation({ summary: 'Create a supplier or vendor' })
    async create(@Body() dto: CreateSupplierDto) {
        const data = await this.supplierService.create(dto);
        return { success: true, message: 'Created successfully', data };
    }

    @Get()
    @Permission(PERMISSIONS.SUPPLIERS_READ)
    @ApiOperation({ summary: 'List suppliers/vendors, optionally filtered by type' })
    @ApiQuery({ name: 'type', required: false, enum: ['SUPPLIER', 'VENDOR'] })
    @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
    async findAll(@Query('type') type: 'SUPPLIER' | 'VENDOR' | undefined, @Query('activeOnly') activeOnly: string | undefined, @Req() req: any) {
        const canViewBanking = req.user.role === 'SUPER_ADMIN' || (req.user.permissions ?? []).includes(PERMISSIONS.SUPPLIERS_VIEW_BANKING);
        const data = await this.supplierService.findAll(type, activeOnly === 'true', canViewBanking);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get(':id')
    @Permission(PERMISSIONS.SUPPLIERS_READ)
    @ApiOperation({ summary: 'Get a single supplier/vendor, including every inventory item they supply' })
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
        const canViewBanking = req.user.role === 'SUPER_ADMIN' || (req.user.permissions ?? []).includes(PERMISSIONS.SUPPLIERS_VIEW_BANKING);
        const data = await this.supplierService.findOne(id, canViewBanking);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Patch(':id')
    @Permission(PERMISSIONS.SUPPLIERS_UPDATE)
    @ApiOperation({ summary: 'Update a supplier/vendor' })
    @ApiParam({ name: 'id' })
    async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
        const data = await this.supplierService.update(id, dto);
        return { success: true, message: 'Updated successfully', data };
    }

    @Delete(':id')
    @Permission(PERMISSIONS.SUPPLIERS_DELETE)
    @ApiOperation({ summary: 'Delete a supplier/vendor — blocked while inventory items are still linked to it' })
    @ApiParam({ name: 'id' })
    async remove(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.supplierService.remove(id);
        return { success: true, message: 'Deleted successfully', data };
    }
}