import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StaffService } from '../staff/staff.service';
import { CreateProductSaleDto } from './dto/create-product-sale.dto';
import { ProductSaleService } from './product-sale.service';

@ApiTags('Staff - Product Sales')
@ApiBearerAuth('JWT-auth')
@Controller('staff/me/product-sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffProductSaleController {
    constructor(
        private readonly productSaleService: ProductSaleService,
        private readonly staffService: StaffService,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Record a standalone product sale at the logged-in staff member\'s own branch' })
    async create(@Req() req: any, @Body() dto: CreateProductSaleDto) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string; locationId: string };
        const data = await this.productSaleService.create(dto, staff.locationId, staff.id);
        return { success: true, message: 'Sale recorded successfully', data };
    }

    @Get()
    @ApiOperation({ summary: 'List product sales at the logged-in staff member\'s own branch' })
    async findAll(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { locationId: string };
        const data = await this.productSaleService.findAll(
            staff.locationId,
            from ? new Date(from) : undefined,
            to ? new Date(to) : undefined,
        );
        return { success: true, message: 'Sales retrieved successfully', data };
    }
}