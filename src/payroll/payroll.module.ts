import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { PaymentModule } from '../payment/payment.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AdminPayrollController } from './admin-payroll.controller';
import { StaffPayrollController } from './staff-payroll.controller';
import { AdminCommissionPlanController } from './admin-commission-plan.controller';
import { StaffBankAccountService } from './staff-bank-account.service';
import { StaffCompensationService } from './staff-compensation.service';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollSalaryCalculatorService } from './payroll-salary-calculator.service';
import { PayrollAdjustmentService } from './payroll-adjustment.service';
import { PayrollReleaseService } from './payroll-release.service';
import { StaffPayoutService } from './staff-payout.service';
import { PayrollAuditService } from './payroll-audit.service';
import { CommissionPlanService } from './commission-plan.service';

@Module({
    imports: [StaffModule, PaymentModule, AttendanceModule],
    controllers: [AdminPayrollController, StaffPayrollController, AdminCommissionPlanController],
    providers: [
        StaffBankAccountService,
        StaffCompensationService,
        PayrollEngineService,
        PayrollSalaryCalculatorService,
        PayrollAdjustmentService,
        PayrollReleaseService,
        StaffPayoutService,
        PayrollAuditService,
        CommissionPlanService,
    ],
    exports: [StaffPayoutService, PayrollReleaseService, PayrollAuditService, CommissionPlanService],
})
export class PayrollModule { }