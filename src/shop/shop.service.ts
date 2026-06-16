import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { AdminQueryProductsDto } from './dto/admin-query-products.dto';
import { AdminQueryShopOrdersDto } from './dto/admin-query-shop-orders.dto';
import { CreateDeliveryRegionDto } from './dto/create-delivery-region.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateShopOrderDto } from './dto/create-shop-order.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { QueryShopOrdersDto } from './dto/query-shop-orders.dto';
import { QuoteShopOrderDto } from './dto/quote-shop-order.dto';
import { UpdateDeliveryRegionDto } from './dto/update-delivery-region.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateShopOrderStatusDto } from './dto/update-shop-order-status.dto';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { DeliveryPricingService } from './services/delivery-pricing.service';
import { ProductCatalogService } from './services/product-catalog.service';
import { ProductCategoryService } from './services/product-category.service';
import { ShopCheckoutService } from './services/shop-checkout.service';
import { ShopOrderQueryService } from './services/shop-order-query.service';

@Injectable()
export class ShopService {
  constructor(
    private readonly productCatalogService: ProductCatalogService,
    private readonly productCategoryService: ProductCategoryService,
    private readonly deliveryPricingService: DeliveryPricingService,
    private readonly shopCheckoutService: ShopCheckoutService,
    private readonly shopOrderQueryService: ShopOrderQueryService,
  ) {}

  findCategories() {
    return this.productCategoryService.findAllPublic();
  }

  findProducts(queryDto: QueryProductsDto) {
    return this.productCatalogService.findActiveProducts(queryDto);
  }

  findProductById(id: string) {
    return this.productCatalogService.findActiveProductById(id);
  }

  quoteOrder(userId: string, dto: QuoteShopOrderDto) {
    return this.shopCheckoutService.quote(userId, dto);
  }

  createOrder(userId: string, dto: CreateShopOrderDto) {
    return this.shopCheckoutService.purchase(userId, dto);
  }

  findUserOrders(userId: string, queryDto: QueryShopOrdersDto) {
    return this.shopOrderQueryService.findUserOrders(userId, queryDto);
  }

  findUserOrderById(id: string, userId: string) {
    return this.shopOrderQueryService.findUserOrderById(id, userId);
  }

  findAdminCategories() {
    return this.productCategoryService.findAllAdmin();
  }

  createCategory(dto: CreateProductCategoryDto) {
    return this.productCategoryService.create(dto);
  }

  updateCategory(id: string, dto: UpdateProductCategoryDto) {
    return this.productCategoryService.update(id, dto);
  }

  removeCategory(id: string) {
    return this.productCategoryService.remove(id);
  }

  findAdminProducts(queryDto: AdminQueryProductsDto) {
    return this.productCatalogService.findAdminProducts(queryDto);
  }

  findAdminProductById(id: string) {
    return this.productCatalogService.findAdminProductById(id);
  }

  createProduct(dto: CreateProductDto, image: Express.Multer.File) {
    return this.productCatalogService.create(dto, image);
  }

  updateProduct(
    id: string,
    dto: UpdateProductDto,
    image?: Express.Multer.File,
  ) {
    return this.productCatalogService.update(id, dto, image);
  }

  updateProductStatus(id: string, status: ProductStatus) {
    return this.productCatalogService.updateStatus(id, status);
  }

  removeProduct(id: string) {
    return this.productCatalogService.remove(id);
  }

  findDeliveryRegions() {
    return this.deliveryPricingService.findAllRegions();
  }

  createDeliveryRegion(dto: CreateDeliveryRegionDto) {
    return this.deliveryPricingService.createRegion(dto);
  }

  updateDeliveryRegion(id: string, dto: UpdateDeliveryRegionDto) {
    return this.deliveryPricingService.updateRegion(id, dto);
  }

  removeDeliveryRegion(id: string) {
    return this.deliveryPricingService.removeRegion(id);
  }

  findAdminOrders(queryDto: AdminQueryShopOrdersDto) {
    return this.shopOrderQueryService.findAdminOrders(queryDto);
  }

  findAdminOrderById(id: string) {
    return this.shopOrderQueryService.findAdminOrderById(id);
  }

  updateOrderStatus(id: string, dto: UpdateShopOrderStatusDto) {
    return this.shopOrderQueryService.updateOrderStatus(id, dto);
  }
}