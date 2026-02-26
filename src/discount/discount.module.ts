import { Module } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { AdminDiscountController } from './admin-discount.controller';
import { DiscountController } from './discount.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminDiscountController, DiscountController],
  providers: [DiscountService],
  exports: [DiscountService],
})
export class DiscountModule {}
