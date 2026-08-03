import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { PaymentModule } from '../payment/payment.module';
import { AdminPayrollController } from './admin-payroll.controller';
import { StaffPayrollController } from './staff-payroll.controller';
import { StaffBankAccountService } from './staff-bank-account.service';
import { StaffCompensationService } from './staff-compensation.service';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollAdjustmentService } from './payroll-adjustment.service';
import { PayrollReleaseService } from './payroll-release.service';
import { StaffPayoutService } from './staff-payout.service';

@Module({
    imports: [StaffModule, PaymentModule],
    controllers: [AdminPayrollController, StaffPayrollController],
    providers: [
        StaffBankAccountService,
        StaffCompensationService,
        PayrollEngineService,
        PayrollAdjustmentService,
        PayrollReleaseService,
        StaffPayoutService,
    ],
    exports: [StaffPayoutService, PayrollReleaseService],
})
export class PayrollModule { }