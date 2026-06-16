import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateShopOrderDto } from './dto/create-shop-order.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { QueryShopOrdersDto } from './dto/query-shop-orders.dto';
import { QuoteShopOrderDto } from './dto/quote-shop-order.dto';
import { ShopService } from './shop.service';

@ApiTags('Shop')
@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('products')
  @Public()
  @ApiOperation({
    summary: 'List shop products',
    description:
      'Returns active products including out-of-stock items (`inStock: false`).',
  })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async findProducts(@Query() queryDto: QueryProductsDto) {
    const data = await this.shopService.findProducts(queryDto);
    return {
      success: true,
      message: 'Products retrieved successfully',
      data,
    };
  }

  @Get('products/:id')
  @Public()
  @ApiOperation({ summary: 'Get product details' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findProductById(@Param('id') id: string) {
    const data = await this.shopService.findProductById(id);
    return {
      success: true,
      message: 'Product retrieved successfully',
      data,
    };
  }

  @Post('orders/quote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Quote shop checkout',
    description:
      'Preview subtotal, delivery fee, and total for a wallet purchase. No wallet debit.',
  })
  @ApiResponse({ status: 200, description: 'Checkout quote calculated' })
  async quoteOrder(
    @GetUser('id') userId: string,
    @Body() dto: QuoteShopOrderDto,
  ) {
    const data = await this.shopService.quoteOrder(userId, dto);
    return {
      success: true,
      message: 'Checkout quote calculated',
      data,
    };
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Place shop order',
    description: 'Purchase products using wallet balance.',
  })
  @ApiResponse({ status: 201, description: 'Shop order placed successfully' })
  async createOrder(
    @GetUser('id') userId: string,
    @Body() dto: CreateShopOrderDto,
  ) {
    const result = await this.shopService.createOrder(userId, dto);
    return {
      success: true,
      message: result.message,
      data: result,
    };
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "Get user's shop orders" })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async findUserOrders(
    @GetUser('id') userId: string,
    @Query() queryDto: QueryShopOrdersDto,
  ) {
    const data = await this.shopService.findUserOrders(userId, queryDto);
    return {
      success: true,
      message: 'Orders retrieved successfully',
      data,
    };
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get shop order details' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOrderById(@Param('id') id: string, @GetUser('id') userId: string) {
    const data = await this.shopService.findUserOrderById(id, userId);
    return {
      success: true,
      message: 'Order retrieved successfully',
      data,
    };
  }
}