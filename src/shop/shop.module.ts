import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminShopController } from './admin-shop.controller';
import { DeliveryPricingService } from './services/delivery-pricing.service';
import { ProductCatalogService } from './services/product-catalog.service';
import { ShopCheckoutService } from './services/shop-checkout.service';
import { ShopOrderQueryService } from './services/shop-order-query.service';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [PrismaModule, CloudinaryModule, MailModule, WalletModule],
  controllers: [ShopController, AdminShopController],
  providers: [
    ShopService,
    ProductCatalogService,
    DeliveryPricingService,
    ShopCheckoutService,
    ShopOrderQueryService,
  ],
  exports: [ShopService],
})
export class ShopModule {}