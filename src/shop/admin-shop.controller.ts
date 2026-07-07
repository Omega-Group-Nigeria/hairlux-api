import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_PRODUCT_IMAGES } from './constants/product-images.constants';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { AdminQueryProductsDto } from './dto/admin-query-products.dto';
import { AdminQueryShopOrdersDto } from './dto/admin-query-shop-orders.dto';
import { CreateDeliveryRegionDto } from './dto/create-delivery-region.dto';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { UpdateDeliveryRegionDto } from './dto/update-delivery-region.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { UpdateShopOrderStatusDto } from './dto/update-shop-order-status.dto';
import { ShopService } from './shop.service';

const productImagesInterceptor = FilesInterceptor('images', MAX_PRODUCT_IMAGES, {
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
});

@ApiTags('Admin - Shop')
@ApiBearerAuth('JWT-auth')
@Controller('admin/shop')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('categories')
  @Permission(PERMISSIONS.SHOP_READ)
  @ApiOperation({ summary: 'List product categories (admin)' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  async findCategories() {
    const data = await this.shopService.findAdminCategories();
    return {
      success: true,
      message: 'Categories retrieved successfully',
      data,
    };
  }

  @Post('categories')
  @Permission(PERMISSIONS.SHOP_MANAGE_CATEGORIES)
  @ApiOperation({ summary: 'Create product category' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  async createCategory(@Body() dto: CreateProductCategoryDto) {
    const data = await this.shopService.createCategory(dto);
    return {
      success: true,
      message: 'Category created successfully',
      data,
    };
  }

  @Put('categories/:id')
  @Permission(PERMISSIONS.SHOP_MANAGE_CATEGORIES)
  @ApiOperation({ summary: 'Update product category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    const data = await this.shopService.updateCategory(id, dto);
    return {
      success: true,
      message: 'Category updated successfully',
      data,
    };
  }

  @Delete('categories/:id')
  @Permission(PERMISSIONS.SHOP_MANAGE_CATEGORIES)
  @ApiOperation({ summary: 'Delete product category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  async removeCategory(@Param('id') id: string) {
    await this.shopService.removeCategory(id);
    return {
      success: true,
      message: 'Category deleted successfully',
    };
  }

  @Get('products')
  @Permission(PERMISSIONS.SHOP_READ)
  @ApiOperation({ summary: 'List shop products (admin)' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async findProducts(@Query() queryDto: AdminQueryProductsDto) {
    const data = await this.shopService.findAdminProducts(queryDto);
    return {
      success: true,
      message: 'Products retrieved successfully',
      data,
    };
  }

  @Get('products/:id')
  @Permission(PERMISSIONS.SHOP_READ)
  @ApiOperation({ summary: 'Get shop product details (admin)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findProductById(@Param('id') id: string) {
    const data = await this.shopService.findAdminProductById(id);
    return {
      success: true,
      message: 'Product retrieved successfully',
      data,
    };
  }

  @Post('products')
  @Permission(PERMISSIONS.SHOP_MANAGE_PRODUCTS)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create shop product',
    description:
      `Create a product with up to ${MAX_PRODUCT_IMAGES} images. Images are stored as WebP in a per-product Cloudinary folder.`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['images', 'categoryId', 'name', 'price'],
      properties: {
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          maxItems: MAX_PRODUCT_IMAGES,
        },
        categoryId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        name: { type: 'string', example: 'Hair Growth Oil' },
        description: { type: 'string' },
        price: { type: 'number', example: 8500 },
        stock: { type: 'number', example: 50 },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @UseInterceptors(productImagesInterceptor)
  async createProduct(
    @Body() dto: CreateProductDto,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    const data = await this.shopService.createProduct(dto, images);
    return {
      success: true,
      message: 'Product created successfully',
      data,
    };
  }

  @Put('products/:id')
  @Permission(PERMISSIONS.SHOP_MANAGE_PRODUCTS)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update shop product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          maxItems: MAX_PRODUCT_IMAGES,
        },
        removeImageIds: {
          type: 'string',
          example: '["123e4567-e89b-12d3-a456-426614174000"]',
          description:
            'JSON array string of product image IDs to remove before adding new images.',
        },
        categoryId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        price: { type: 'number' },
        stock: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @UseInterceptors(productImagesInterceptor)
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    const data = await this.shopService.updateProduct(id, dto, images);
    return {
      success: true,
      message: 'Product updated successfully',
      data,
    };
  }

  @Patch('products/:id/status')
  @Permission(PERMISSIONS.SHOP_MANAGE_PRODUCTS)
  @ApiOperation({ summary: 'Update product status' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product status updated successfully' })
  async updateProductStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    const data = await this.shopService.updateProductStatus(id, dto.status);
    return {
      success: true,
      message: 'Product status updated successfully',
      data,
    };
  }

  @Delete('products/:id')
  @Permission(PERMISSIONS.SHOP_MANAGE_PRODUCTS)
  @ApiOperation({ summary: 'Delete shop product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  async removeProduct(@Param('id') id: string) {
    await this.shopService.removeProduct(id);
    return {
      success: true,
      message: 'Product deleted successfully',
    };
  }

  @Get('delivery-regions')
  @Permission(PERMISSIONS.SHOP_READ)
  @ApiOperation({ summary: 'List delivery regions' })
  @ApiResponse({ status: 200, description: 'Delivery regions retrieved successfully' })
  async findDeliveryRegions() {
    const data = await this.shopService.findDeliveryRegions();
    return {
      success: true,
      message: 'Delivery regions retrieved successfully',
      data,
    };
  }

  @Post('delivery-regions')
  @Permission(PERMISSIONS.SHOP_MANAGE_DELIVERY)
  @ApiOperation({ summary: 'Create delivery region' })
  @ApiResponse({ status: 201, description: 'Delivery region created successfully' })
  async createDeliveryRegion(@Body() dto: CreateDeliveryRegionDto) {
    const data = await this.shopService.createDeliveryRegion(dto);
    return {
      success: true,
      message: 'Delivery region created successfully',
      data,
    };
  }

  @Put('delivery-regions/:id')
  @Permission(PERMISSIONS.SHOP_MANAGE_DELIVERY)
  @ApiOperation({ summary: 'Update delivery region' })
  @ApiParam({ name: 'id', description: 'Delivery region ID' })
  @ApiResponse({ status: 200, description: 'Delivery region updated successfully' })
  async updateDeliveryRegion(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryRegionDto,
  ) {
    const data = await this.shopService.updateDeliveryRegion(id, dto);
    return {
      success: true,
      message: 'Delivery region updated successfully',
      data,
    };
  }

  @Delete('delivery-regions/:id')
  @Permission(PERMISSIONS.SHOP_MANAGE_DELIVERY)
  @ApiOperation({ summary: 'Delete delivery region' })
  @ApiParam({ name: 'id', description: 'Delivery region ID' })
  @ApiResponse({ status: 200, description: 'Delivery region deleted successfully' })
  async removeDeliveryRegion(@Param('id') id: string) {
    await this.shopService.removeDeliveryRegion(id);
    return {
      success: true,
      message: 'Delivery region deleted successfully',
    };
  }

  @Get('orders')
  @Permission(PERMISSIONS.SHOP_READ)
  @ApiOperation({ summary: 'List shop orders (admin)' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async findOrders(@Query() queryDto: AdminQueryShopOrdersDto) {
    const data = await this.shopService.findAdminOrders(queryDto);
    return {
      success: true,
      message: 'Orders retrieved successfully',
      data,
    };
  }

  @Get('orders/:id')
  @Permission(PERMISSIONS.SHOP_READ)
  @ApiOperation({ summary: 'Get shop order details (admin)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  async findOrderById(@Param('id') id: string) {
    const data = await this.shopService.findAdminOrderById(id);
    return {
      success: true,
      message: 'Order retrieved successfully',
      data,
    };
  }

  @Patch('orders/:id/status')
  @Permission(PERMISSIONS.SHOP_UPDATE_STATUS)
  @ApiOperation({
    summary: 'Update shop order status',
    description:
      'Advance fulfilment (PROCESSING → SHIPPED → DELIVERED) or cancel with wallet refund and stock restore.',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order status updated successfully' })
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateShopOrderStatusDto,
  ) {
    const data = await this.shopService.updateOrderStatus(id, dto);
    return {
      success: true,
      message: 'Order status updated successfully',
      data,
    };
  }
}