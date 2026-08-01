import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StaffService } from '../staff/staff.service';
import { CreateProductSaleDto } from './dto/create-product-sale.dto';
import { ProductSaleService } from './product-sale.service';

@ApiTags('Admin - Product Sales')
@ApiBearerAuth('JWT-auth')
@Controller('admin/product-sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminProductSaleController {
    constructor(
        private readonly productSaleService: ProductSaleService,
        private readonly staffService: StaffService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List product sales across all branches, filterable by branch and date range' })
    async findAll(@Query('branchId') branchId?: string, @Query('from') from?: string, @Query('to') to?: string) {
        const data = await this.productSaleService.findAll(
            branchId,
            from ? new Date(from) : undefined,
            to ? new Date(to) : undefined,
        );
        return { success: true, message: 'Sales retrieved successfully', data };
    }

    @Post()
    @ApiOperation({ summary: 'Record a standalone product sale (Admin/Super Admin — requires an explicit branchId)' })
    async create(@Req() req: any, @Body() dto: CreateProductSaleDto) {
        if (!dto.branchId) {
            throw new BadRequestException('branchId is required');
        }
        const staff = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.productSaleService.create(dto, dto.branchId, staff?.id);
        return { success: true, message: 'Sale recorded successfully', data };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single sale' })
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.productSaleService.findOne(id);
        return { success: true, message: 'Sale retrieved successfully', data };
    }
}