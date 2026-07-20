import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { ShopNotificationsModule } from '../notifications/shop/shop-notifications.module';
import { AdminShopController } from './admin-shop.controller';
import { DeliveryPricingService } from './services/delivery-pricing.service';
import { ProductCatalogService } from './services/product-catalog.service';
import { ProductCategoryService } from './services/product-category.service';
import { ShopCheckoutService } from './services/shop-checkout.service';
import { ShopOrderCodeService } from './services/shop-order-code.service';
import { ShopOrderQueryService } from './services/shop-order-query.service';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    MailModule,
    WalletModule,
    ShopNotificationsModule,
  ],
  controllers: [ShopController, AdminShopController],
  providers: [
    ShopService,
    ProductCatalogService,
    ProductCategoryService,
    DeliveryPricingService,
    ShopCheckoutService,
    ShopOrderCodeService,
    ShopOrderQueryService,
  ],
  exports: [ShopService],
})
export class ShopModule {}