import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { PayrollEngineService } from './payroll-engine.service';
import { SystemAuditService } from '../common/services/system-audit.service';
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
        private readonly payrollEngineService: PayrollEngineService,
        private readonly systemAuditService: SystemAuditService,
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

    @Get('current-fines')
    @ApiOperation({ summary: 'My running late-penalty and absent-fee total for the in-progress payroll period (default), or for a specific past period when periodStart/periodEnd query params are given -- e.g. to see what fed into an already-published payslip from a prior month' })
    async getCurrentFines(@Req() req: any, @Query('periodStart') periodStart?: string, @Query('periodEnd') periodEnd?: string) {
        const staffId = await this.myStaffId(req);
        const explicitRange = periodStart && periodEnd ? { start: new Date(periodStart), end: new Date(periodEnd) } : undefined;
        const data = await this.payrollEngineService.getCurrentFinesForStaff(staffId, explicitRange);
        return { success: true, message: 'Retrieved successfully', data };
    }

    // -- Payslips --------------------------------------------------------

    @Get('payslips')
    @ApiOperation({ summary: 'My payslip history — only finalized, published payslips' })
    async getPayslips(@Req() req: any) {
        const staffId = await this.myStaffId(req);
        const data = await this.prisma.payslip.findMany({
            // Guide, section 15, "Staff portal and download requirements"
            // #3-4: "Display a payslip only after payroll is finalized and
            // published. Do not show draft, cancelled, reversed, or
            // superseded records as active payslips." PUBLISHED is the
            // only status a staff member should ever see in their own
            // history -- CORRECTED payslips remain visible too (they're
            // still an active, current record, just one that's since been
            // corrected further), everything else (DRAFT/SUPERSEDED/CANCELLED)
            // is filtered out entirely.
            where: { staffId, status: { in: ['PUBLISHED', 'CORRECTED'] } },
            include: { payrollPeriod: { select: { id: true, label: true, periodStart: true, periodEnd: true, status: true } } },
            orderBy: { payrollPeriod: { periodStart: 'desc' } },
        });
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('payslips/:id.pdf')
    @ApiOperation({ summary: 'Download one of my own payslips as a PDF' })
    @ApiResponse({ status: 200, description: 'PDF stream' })
    @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
    @ApiResponse({ status: 404, description: 'Payslip not found, or does not belong to this staff member' })
    async downloadMyPayslip(
        @Req() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const staffId = await this.myStaffId(req);
        // staffId is passed to generatePayslipPdf itself (not just checked
        // here first) so ownership is enforced inside the one shared method,
        // the same way it's designed to be reused safely by any future
        // admin download path too.
        const pdfBuffer = await this.payrollEngineService.generatePayslipPdf(id, staffId);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="payslip-${id}.pdf"`,
        });
        return new StreamableFile(pdfBuffer);
    }

    // Deliberately declared AFTER the .pdf route above -- Express/NestJS
    // matches routes in declaration order, and this plain :id pattern
    // would otherwise greedily match "<uuid>.pdf" as its own id parameter
    // first, shadowing the PDF download entirely (ParseUUIDPipe would
    // then reject it as an invalid UUID before ever reaching the real
    // handler). The more specific literal-suffix route must always come first.
    @Get('payslips/:id')
    @ApiOperation({ summary: 'Full detail view of one of my own payslips' })
    async getPayslipDetail(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const staffId = await this.myStaffId(req);
        const payslip = await this.prisma.payslip.findFirst({
            where: { id, staffId, status: { in: ['PUBLISHED', 'CORRECTED'] } },
            include: {
                payrollPeriod: { select: { id: true, label: true, periodStart: true, periodEnd: true, status: true } },
                adjustments: true,
                supersedes: { select: { id: true, payslipReference: true, status: true } },
                supersededBy: { select: { id: true, payslipReference: true, status: true } },
            },
        });
        if (!payslip) throw new NotFoundException('Payslip not found');

        // Guide, section 15/16: "Log payslip viewing and downloading."
        // Deliberately logged here (the detail endpoint) and not in
        // getPayslips above -- appearing in a list a staff member scrolled
        // past isn't the same auditable event as actually opening one.
        await this.systemAuditService.log({
            action: 'PAYSLIP_VIEWED',
            entityType: 'Payslip',
            entityId: payslip.id,
            staffId,
        });

        return { success: true, message: 'Retrieved successfully', data: payslip };
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