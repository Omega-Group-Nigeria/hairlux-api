import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';
import { ProductSaleService } from './product-sale.service';
import { StaffProductSaleController } from './staff-product-sale.controller';
import { AdminProductSaleController } from './admin-product-sale.controller';

@Module({
    imports: [StaffModule, InventoryModule, FinanceModule],
    controllers: [StaffProductSaleController, AdminProductSaleController],
    providers: [ProductSaleService],
    exports: [ProductSaleService],
})
export class ProductSaleModule { }