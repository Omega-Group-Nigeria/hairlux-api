import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffModule } from '../staff/staff.module';
import { ApprovalService } from './approval.service';
import { StaffApprovalController } from './staff-approval.controller';

@Module({
    imports: [PrismaModule, StaffModule],
    controllers: [StaffApprovalController],
    providers: [ApprovalService],
    exports: [ApprovalService],
})
export class ApprovalModule { }
