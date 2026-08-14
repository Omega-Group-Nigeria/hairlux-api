import { Module } from '@nestjs/common';
import { BranchFinanceController } from './branch-finance.controller';
import { BranchFinanceService } from './branch-finance.service';

@Module({
    controllers: [BranchFinanceController],
    providers: [BranchFinanceService],
})
export class BranchFinanceModule { }