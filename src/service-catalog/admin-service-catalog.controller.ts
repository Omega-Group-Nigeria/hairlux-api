import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
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
import { ServiceRecipeService } from './service-recipe.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpdateServiceStatusDto } from './dto/update-service-status.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { SetServiceRecipeDto } from './dto/set-service-recipe.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin - Services')
@ApiBearerAuth('JWT-auth')
@Controller('admin/services')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminServiceCatalogController {
  constructor(
    private readonly serviceCatalogService: ServiceCatalogService,
    private readonly serviceRecipeService: ServiceRecipeService,
  ) { }

  @Get(':id/recipe')
  @Permission(PERMISSIONS.SERVICES_MANAGE_RECIPE)
  @ApiOperation({ summary: "Get a service's configured product-consumption recipe" })
  @ApiParam({ name: 'id' })
  async getRecipe(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.serviceRecipeService.getRecipe(id);
    return { success: true, message: 'Retrieved successfully', data };
  }

  @Put(':id/recipe')
  @Permission(PERMISSIONS.SERVICES_MANAGE_RECIPE)
  @ApiOperation({
    summary: "Set a service's product-consumption recipe",
    description: 'Full replace -- send every line that should remain. An empty array clears the recipe entirely.',
  })
  @ApiParam({ name: 'id' })
  async setRecipe(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetServiceRecipeDto) {
    const data = await this.serviceRecipeService.setRecipe(id, dto.lines);
    return { success: true, message: 'Recipe updated successfully', data };
  }

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
            imageUrl:
              'https://res.cloudinary.com/demo/image/upload/v1234567890/hairlux/service-categories/hair-services.webp',
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
            imageUrl:
              'https://res.cloudinary.com/demo/image/upload/v1234567890/hairlux/service-categories/hair-services.webp',
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
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create category',
    description:
      'Create a new service category. Image is required (any format — stored as WebP on Cloudinary).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image', 'name'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Category image (jpg/png/webp etc.)',
        },
        name: { type: 'string', example: 'Nail Services' },
        description: {
          type: 'string',
          example: 'Manicure, pedicure, and nail art',
        },
      },
    },
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
          imageUrl:
            'https://res.cloudinary.com/demo/image/upload/v1234567890/hairlux/service-categories/nail-services.webp',
          imagePublicId: 'hairlux/service-categories/abc123',
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
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
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
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    const data = await this.serviceCatalogService.createCategory(dto, image);
    return { success: true, message: 'Category created successfully', data };
  }

  @Put('categories/:id')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update category',
    description:
      'Update category name, description, or image. If a new image is provided, the old Cloudinary asset is deleted.',
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'New category image (optional)',
        },
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
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
          imageUrl:
            'https://res.cloudinary.com/demo/image/upload/v9876543210/hairlux/service-categories/nail-services-new.webp',
          imagePublicId: 'hairlux/service-categories/xyz789',
          createdAt: '2026-01-15T10:30:00.000Z',
          updatedAt: '2026-02-22T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
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
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    const data = await this.serviceCatalogService.updateCategory(
      id,
      dto,
      image,
    );
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