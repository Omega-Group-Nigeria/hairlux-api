import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApprovalModule } from '../approval/approval.module';
import { StaffModule } from '../staff/staff.module';
import { FinanceModule } from '../finance/finance.module';
import { PurchaseRequestService } from './purchase-request.service';
import { PurchaseService } from './purchase.service';
import { AdminPurchaseRequestController } from './admin-purchase-request.controller';
import { AdminPurchaseController } from './admin-purchase.controller';

@Module({
    imports: [PrismaModule, ApprovalModule, StaffModule, FinanceModule],
    controllers: [AdminPurchaseRequestController, AdminPurchaseController],
    providers: [PurchaseRequestService, PurchaseService],
    exports: [PurchaseRequestService, PurchaseService],
})
export class PurchaseModule { }