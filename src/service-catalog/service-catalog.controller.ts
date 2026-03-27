import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { ServiceCatalogService } from './service-catalog.service';
import { QueryServicesDto } from './dto/query-services.dto';
import { ServiceResponseDto } from './dto/service-response.dto';
import { BookingType } from '@prisma/client';

@ApiTags('Services')
@Controller('services')
export class ServiceCatalogController {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all services',
    description: 'Retrieve a list of all active services with optional filters',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search services by name',
    example: 'braids',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status (ACTIVE/INACTIVE)',
    example: 'ACTIVE',
  })
  @ApiQuery({
    name: 'bookingType',
    required: false,
    description:
      'Optional booking type filter. Returns only services available for this type and includes effectivePrice.',
    enum: ['HOME_SERVICE', 'WALK_IN'],
    example: 'WALK_IN',
  })
  @ApiResponse({
    status: 200,
    description: 'Services retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Services retrieved successfully',
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174001',
            categoryId: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Box Braids',
            description:
              'Beautiful long-lasting box braids styled to perfection',
            walkInPrice: 25000,
            homeServicePrice: 30000,
            isWalkInAvailable: true,
            isHomeServiceAvailable: true,
            effectivePrice: 25000,
            duration: 180,
            status: 'ACTIVE',
            imageUrl:
              'https://res.cloudinary.com/demo/image/upload/v1234567890/hairlux/services/box-braids.webp',
            category: {
              id: '123e4567-e89b-12d3-a456-426614174000',
              name: 'Hair Services',
              description: 'Professional hair styling and treatments',
              createdAt: '2026-01-15T10:30:00.000Z',
              updatedAt: '2026-01-15T10:30:00.000Z',
            },
            createdAt: '2026-01-15T10:30:00.000Z',
            updatedAt: '2026-01-15T10:30:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request',
    schema: {
      example: {
        success: false,
        message: 'Validation failed',
        errors: ['status must be one of: ACTIVE, INACTIVE'],
      },
    },
  })
  async findAll(@Query() queryDto: QueryServicesDto) {
    const services = await this.serviceCatalogService.findAll(queryDto);
    return {
      success: true,
      message: 'Services retrieved successfully',
      data: services,
    };
  }

  @Get('categories')
  @ApiOperation({
    summary: 'Get all service categories',
    description:
      'Retrieve a list of all service categories with service counts',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Categories retrieved successfully',
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Hair Services',
            description: 'Professional hair styling and treatments',
            serviceCount: 5,
            createdAt: '2024-01-15T10:30:00.000Z',
            updatedAt: '2024-01-15T10:30:00.000Z',
          },
          {
            id: '123e4567-e89b-12d3-a456-426614174002',
            name: 'Nail Services',
            description: 'Manicure, pedicure, and nail art',
            serviceCount: 3,
            createdAt: '2024-01-15T10:30:00.000Z',
            updatedAt: '2024-01-15T10:30:00.000Z',
          },
        ],
      },
    },
  })
  async findAllCategories() {
    const categories = await this.serviceCatalogService.findAllCategories();
    return {
      success: true,
      message: 'Categories retrieved successfully',
      data: categories,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get service by ID',
    description: 'Retrieve detailed information about a specific service',
  })
  @ApiParam({
    name: 'id',
    description: 'Service ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @ApiQuery({
    name: 'bookingType',
    required: false,
    description:
      'Optional booking type to resolve effectivePrice and enforce type-specific availability.',
    enum: ['HOME_SERVICE', 'WALK_IN'],
    example: 'HOME_SERVICE',
  })
  @ApiResponse({
    status: 200,
    description: 'Service retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Service retrieved successfully',
        data: {
          id: '123e4567-e89b-12d3-a456-426614174001',
          categoryId: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Box Braids',
          description: 'Beautiful long-lasting box braids styled to perfection',
          walkInPrice: 25000,
          homeServicePrice: 30000,
          isWalkInAvailable: true,
          isHomeServiceAvailable: true,
          effectivePrice: 30000,
          duration: 180,
          status: 'ACTIVE',
          imageUrl:
            'https://res.cloudinary.com/demo/image/upload/v1234567890/hairlux/services/box-braids.webp',
          category: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Hair Services',
            description: 'Professional hair styling and treatments',
            createdAt: '2026-01-15T10:30:00.000Z',
            updatedAt: '2026-01-15T10:30:00.000Z',
          },
          createdAt: '2026-01-15T10:30:00.000Z',
          updatedAt: '2026-01-15T10:30:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Service not found',
    schema: {
      example: {
        success: false,
        message: 'Service not found',
      },
    },
  })
  async findOne(
    @Param('id') id: string,
    @Query('bookingType') bookingType?: BookingType,
  ) {
    const service = await this.serviceCatalogService.findOne(id, bookingType);
    return {
      success: true,
      message: 'Service retrieved successfully',
      data: service,
    };
  }
}
