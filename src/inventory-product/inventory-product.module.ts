import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryProductService } from './inventory-product.service';
import { AdminInventoryProductController } from './admin-inventory-product.controller';

@Module({
    imports: [PrismaModule],
    controllers: [AdminInventoryProductController],
    providers: [InventoryProductService],
    exports: [InventoryProductService],
})
export class InventoryProductModule { }