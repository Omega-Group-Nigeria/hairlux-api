import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DiscountService } from './discount.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { QueryDiscountsDto } from './dto/query-discounts.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin - Discounts')
@ApiBearerAuth('JWT-auth')
@Controller('admin/discounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminDiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a discount code',
    description:
      'Create a new discount code with a percentage off. Code is auto-uppercased.',
  })
  @ApiResponse({
    status: 201,
    description: 'Discount code created successfully',
    example: {
      success: true,
      message: 'Discount code created successfully',
      data: {
        id: 'uuid',
        code: 'SUMMER20',
        name: 'Summer Sale',
        percentage: 20,
        isActive: true,
        expiresAt: '2026-12-31T00:00:00.000Z',
        maxUses: 100,
        usedCount: 0,
        createdAt: '2026-02-22T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Discount code already exists' })
  async create(@Body() dto: CreateDiscountDto) {
    const data = await this.discountService.create(dto);
    return {
      success: true,
      message: 'Discount code created successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List all discount codes',
    description:
      'Returns all codes with pagination. Filter by isActive or search by code/name.',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount codes retrieved successfully',
    example: {
      success: true,
      message: 'Discount codes retrieved successfully',
      data: {
        discounts: [
          {
            id: 'uuid',
            code: 'SUMMER20',
            name: 'Summer Sale',
            percentage: 20,
            isActive: true,
            expiresAt: '2026-12-31T00:00:00.000Z',
            maxUses: 100,
            usedCount: 14,
          },
        ],
        pagination: { page: 1, limit: 20, total: 5, totalPages: 1 },
      },
    },
  })
  async findAll(@Query() query: QueryDiscountsDto) {
    const data = await this.discountService.findAll(query);
    return {
      success: true,
      message: 'Discount codes retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a discount code by ID',
    description:
      'Returns full details of a single discount code including usage count.',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount code retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Discount code not found' })
  async findOne(@Param('id') id: string) {
    const data = await this.discountService.findOne(id);
    return {
      success: true,
      message: 'Discount code retrieved successfully',
      data,
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a discount code',
    description:
      'Update any field on a discount code. To remove expiry or maxUses, pass null explicitly.',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount code updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Discount code not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
    const data = await this.discountService.update(id, dto);
    return {
      success: true,
      message: 'Discount code updated successfully',
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a discount code',
    description: 'Permanently delete a discount code.',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount code deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Discount code not found' })
  async remove(@Param('id') id: string) {
    await this.discountService.remove(id);
    return { success: true, message: 'Discount code deleted successfully' };
  }
}
