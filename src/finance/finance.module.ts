import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancialTransactionService } from './financial-transaction.service';
import { AdminFinancialTransactionController } from './admin-financial-transaction.controller';

@Module({
    imports: [PrismaModule],
    controllers: [AdminFinancialTransactionController],
    providers: [FinancialTransactionService],
    exports: [FinancialTransactionService],
})
export class FinanceModule { }