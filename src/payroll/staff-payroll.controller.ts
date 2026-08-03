import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StaffService } from '../staff/staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffBankAccountService } from './staff-bank-account.service';
import { StaffCompensationService } from './staff-compensation.service';
import { PayrollAdjustmentService } from './payroll-adjustment.service';
import { StaffPayoutService } from './staff-payout.service';
import { SubmitBankAccountDto } from './dto/submit-bank-account.dto';
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto';

@ApiTags('Staff - Payroll')
@ApiBearerAuth('JWT-auth')
@Controller('staff/me/payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffPayrollController {
    constructor(
        private readonly staffService: StaffService,
        private readonly prisma: PrismaService,
        private readonly bankAccountService: StaffBankAccountService,
        private readonly compensationService: StaffCompensationService,
        private readonly adjustmentService: PayrollAdjustmentService,
        private readonly payoutService: StaffPayoutService,
    ) { }

    private async myStaffId(req: any): Promise<string> {
        const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string };
        return staff.id;
    }

    // -- Bank account --------------------------------------------------------

    @Get('banks')
    @ApiOperation({ summary: 'List Nigerian banks (for the bank account picker)' })
    async listBanks() {
        const data = await this.bankAccountService.listBanks();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('bank-account')
    @ApiOperation({ summary: 'Get my bank account on file, including any pending change awaiting admin approval' })
    async getBankAccount(@Req() req: any) {
        const staffId = await this.myStaffId(req);
        const data = await this.bankAccountService.getBankAccount(staffId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post('bank-account/resolve')
    @ApiOperation({ summary: 'Live preview — resolve an account number/bank code to the real account holder name, without saving anything. Also flags whether the name matches the staff member.' })
    async resolveBankAccount(@Req() req: any, @Body() dto: SubmitBankAccountDto) {
        const staffId = await this.myStaffId(req);
        const data = await this.bankAccountService.resolveAccount(staffId, dto.bankCode, dto.accountNumber);
        return { success: true, message: 'Resolved successfully', data };
    }

    @Post('bank-account')
    @ApiOperation({ summary: 'Set up (first time) or request a change to (thereafter) my bank account for salary payment. A change requires admin approval before it takes effect.' })
    async submitBankAccount(@Req() req: any, @Body() dto: SubmitBankAccountDto) {
        const staffId = await this.myStaffId(req);
        const data = await this.bankAccountService.submitBankAccount(staffId, dto);
        return { success: true, message: 'Bank account saved successfully', data };
    }

    // -- Compensation (read-only) --------------------------------------------------------

    @Get('compensation')
    @ApiOperation({ summary: 'My current base salary and allowances' })
    async getCompensation(@Req() req: any) {
        const staffId = await this.myStaffId(req);
        const data = await this.compensationService.getCurrentCompensation(staffId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    // -- Payslips --------------------------------------------------------

    @Get('payslips')
    @ApiOperation({ summary: 'My payslip history' })
    async getPayslips(@Req() req: any) {
        const staffId = await this.myStaffId(req);
        const data = await this.prisma.payslip.findMany({
            where: { staffId },
            include: { payrollPeriod: { select: { id: true, label: true, periodStart: true, periodEnd: true, status: true } } },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('adjustments')
    @ApiOperation({ summary: 'My bonus/deduction adjustment history' })
    async getAdjustments(@Req() req: any) {
        const staffId = await this.myStaffId(req);
        const data = await this.adjustmentService.listForStaff(staffId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    // -- Wallet & withdrawals --------------------------------------------------------

    @Get('wallet')
    @ApiOperation({ summary: 'My salary wallet balance' })
    async getWallet(@Req() req: any) {
        const staffId = await this.myStaffId(req);
        const data = await this.payoutService.getMyWallet(staffId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post('withdrawals')
    @ApiOperation({ summary: 'Request a withdrawal from my salary wallet — full or partial, as many times as needed until the balance reaches zero. Requires Payday to be switched on.' })
    async requestWithdrawal(@Req() req: any, @Body() dto: RequestWithdrawalDto) {
        const staffId = await this.myStaffId(req);
        const data = await this.payoutService.requestWithdrawal(staffId, dto.amount);
        return { success: true, message: 'Withdrawal requested successfully', data };
    }

    @Get('withdrawals')
    @ApiOperation({ summary: 'My withdrawal history' })
    async listWithdrawals(@Req() req: any) {
        const staffId = await this.myStaffId(req);
        const data = await this.payoutService.listMyWithdrawals(staffId);
        return { success: true, message: 'Retrieved successfully', data };
    }
}