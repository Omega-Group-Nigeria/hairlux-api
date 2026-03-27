import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ServiceCatalogService } from './service-catalog.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpdateServiceStatusDto } from './dto/update-service-status.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin - Services')
@ApiBearerAuth('JWT-auth')
@Controller('admin/services')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminServiceCatalogController {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create new service',
    description:
      'Create a new service. Image is required (any format — stored as WebP on Cloudinary).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'image',
        'categoryId',
        'name',
        'description',
        'walkInPrice',
        'homeServicePrice',
        'duration',
      ],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Service image (jpg/png/webp etc.)',
        },
        categoryId: {
          type: 'string',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
        name: { type: 'string', example: 'Box Braids' },
        description: {
          type: 'string',
          example: 'Beautiful long-lasting box braids',
        },
        walkInPrice: { type: 'number', example: 25000 },
        homeServicePrice: { type: 'number', example: 30000 },
        isWalkInAvailable: { type: 'boolean', example: true, default: true },
        isHomeServiceAvailable: {
          type: 'boolean',
          example: true,
          default: true,
        },
        duration: { type: 'number', example: 180 },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Service created successfully',
    schema: {
      example: {
        success: true,
        message: 'Service created successfully',
        data: {
          id: '123e4567-e89b-12d3-a456-426614174001',
          categoryId: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Box Braids',
          description: 'Beautiful long-lasting box braids',
          walkInPrice: 25000,
          homeServicePrice: 30000,
          isWalkInAvailable: true,
          isHomeServiceAvailable: true,
          duration: 180,
          status: 'ACTIVE',
          imageUrl:
            'https://res.cloudinary.com/demo/image/upload/v1234567890/hairlux/services/box-braids.webp',
          imagePublicId: 'hairlux/services/abc123',
          category: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Hair Services',
            description: 'Professional hair styling',
            createdAt: '2026-01-15T10:30:00.000Z',
            updatedAt: '2026-01-15T10:30:00.000Z',
          },
          createdAt: '2026-02-22T10:00:00.000Z',
          updatedAt: '2026-02-22T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request — image missing or invalid',
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({
    status: 409,
    description: 'Service name already exists in category',
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed.'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async create(
    @Body() createServiceDto: CreateServiceDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    const service = await this.serviceCatalogService.create(
      createServiceDto,
      image,
    );
    return {
      success: true,
      message: 'Service created successfully',
      data: service,
    };
  }

  @Put(':id')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update service',
    description:
      'Update service details. Optionally replace the image — if provided, old Cloudinary image is deleted.',
  })
  @ApiParam({ name: 'id', description: 'Service ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'New service image (optional)',
        },
        categoryId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        walkInPrice: { type: 'number' },
        homeServicePrice: { type: 'number' },
        isWalkInAvailable: { type: 'boolean' },
        isHomeServiceAvailable: { type: 'boolean' },
        duration: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Service updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Service updated successfully',
        data: {
          id: '123e4567-e89b-12d3-a456-426614174001',
          categoryId: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Box Braids (Updated)',
          description: 'Beautiful long-lasting box braids',
          walkInPrice: 28000,
          homeServicePrice: 32000,
          isWalkInAvailable: true,
          isHomeServiceAvailable: false,
          duration: 180,
          status: 'ACTIVE',
          imageUrl:
            'https://res.cloudinary.com/demo/image/upload/v9876543210/hairlux/services/box-braids-new.webp',
          imagePublicId: 'hairlux/services/xyz789',
          category: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Hair Services',
            description: 'Professional hair styling',
            createdAt: '2026-01-15T10:30:00.000Z',
            updatedAt: '2026-01-15T10:30:00.000Z',
          },
          createdAt: '2026-01-15T10:30:00.000Z',
          updatedAt: '2026-02-22T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 404, description: 'Service or category not found' })
  @ApiResponse({ status: 409, description: 'Service name conflict' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed.'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() updateServiceDto: UpdateServiceDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    const service = await this.serviceCatalogService.update(
      id,
      updateServiceDto,
      image,
    );
    return {
      success: true,
      message: 'Service updated successfully',
      data: service,
    };
  }

  @Put(':id/status')
  @ApiOperation({
    summary: 'Update service status',
    description: 'Activate or deactivate a service',
  })
  @ApiParam({ name: 'id', description: 'Service ID' })
  @ApiResponse({
    status: 200,
    description: 'Service status updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Service status updated successfully',
        data: {
          id: '123e4567-e89b-12d3-a456-426614174001',
          status: 'INACTIVE',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Service not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateServiceStatusDto,
  ) {
    const service = await this.serviceCatalogService.updateStatus(
      id,
      updateStatusDto.status,
    );
    return {
      success: true,
      message: 'Service status updated successfully',
      data: {
        id: service.id,
        status: service.status,
      },
    };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete service',
    description:
      'Delete a service from the catalog (only if no bookings exist)',
  })
  @ApiParam({ name: 'id', description: 'Service ID' })
  @ApiResponse({
    status: 200,
    description: 'Service deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Service deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Service not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete service with existing bookings',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async remove(@Param('id') id: string) {
    await this.serviceCatalogService.remove(id);
    return {
      success: true,
      message: 'Service deleted successfully',
    };
  }

  // ─── Category Management ───────────────────────────────────────────────────

  @Post('categories')
  @ApiOperation({
    summary: 'Create category',
    description: 'Create a new service category.',
  })
  @ApiResponse({
    status: 201,
    description: 'Category created successfully',
    schema: {
      example: {
        success: true,
        message: 'Category created successfully',
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Nail Services',
          description: 'Manicure, pedicure, and nail art',
          createdAt: '2026-02-22T10:00:00.000Z',
          updatedAt: '2026-02-22T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    const data = await this.serviceCatalogService.createCategory(dto);
    return { success: true, message: 'Category created successfully', data };
  }

  @Put('categories/:id')
  @ApiOperation({
    summary: 'Update category',
    description: 'Update category name or description.',
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({
    status: 200,
    description: 'Category updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Category updated successfully',
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Nail Services',
          description: 'Manicure, pedicure, and nail art',
          createdAt: '2026-01-15T10:30:00.000Z',
          updatedAt: '2026-02-22T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const data = await this.serviceCatalogService.updateCategory(id, dto);
    return { success: true, message: 'Category updated successfully', data };
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete category',
    description:
      'Delete a category. Fails if any services are still assigned to it.',
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({
    status: 200,
    description: 'Category deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Category deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category has services attached' })
  async removeCategory(@Param('id') id: string) {
    await this.serviceCatalogService.removeCategory(id);
    return { success: true, message: 'Category deleted successfully' };
  }
}
