import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { InventoryProductService } from './inventory-product.service';
import { UpsertInventoryProductDto } from './dto/upsert-inventory-product.dto';

@ApiTags('Admin - Inventory Products (Procurement Integration)')
@ApiBearerAuth('JWT-auth')
@Controller('admin/inventory-products')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class AdminInventoryProductController {
    constructor(private readonly inventoryProductService: InventoryProductService) { }

    @Get()
    @Permission(PERMISSIONS.INVENTORY_PRODUCTS_READ)
    @ApiOperation({ summary: 'List products in the master catalogue' })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'category', required: false })
    @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
    @ApiQuery({ name: 'vendorId', required: false, description: 'Only products supplied by this vendor' })
    @ApiQuery({ name: 'noVendor', required: false, type: Boolean, description: 'Only products with zero vendors attached' })
    async findAll(
        @Query('search') search?: string,
        @Query('category') category?: string,
        @Query('activeOnly') activeOnly?: string,
        @Query('vendorId') vendorId?: string,
        @Query('noVendor') noVendor?: string,
    ) {
        const data = await this.inventoryProductService.findAll({
            search, category, activeOnly: activeOnly === 'true', vendorId, noVendor: noVendor === 'true',
        });
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get(':id')
    @Permission(PERMISSIONS.INVENTORY_PRODUCTS_READ)
    @ApiOperation({ summary: 'Get one product, its supplying vendors, and branch stock breakdown' })
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.inventoryProductService.findOne(id);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post()
    @Permission(PERMISSIONS.INVENTORY_PRODUCTS_CREATE)
    @ApiOperation({ summary: 'Add a new product to the master catalogue' })
    async create(@Body() dto: UpsertInventoryProductDto) {
        const data = await this.inventoryProductService.create(dto);
        return { success: true, message: 'Product created', data };
    }

    @Patch(':id')
    @Permission(PERMISSIONS.INVENTORY_PRODUCTS_UPDATE)
    @ApiOperation({ summary: 'Update a product' })
    @ApiParam({ name: 'id' })
    async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertInventoryProductDto) {
        const data = await this.inventoryProductService.update(id, dto);
        return { success: true, message: 'Product updated', data };
    }

    @Delete(':id')
    @Permission(PERMISSIONS.INVENTORY_PRODUCTS_DELETE)
    @ApiOperation({ summary: 'Delete a product — blocked while branch inventory items are still linked' })
    @ApiParam({ name: 'id' })
    async remove(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.inventoryProductService.remove(id);
        return { success: true, message: 'Product deleted', data };
    }
}