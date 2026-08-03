import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Permission } from '../auth/decorators/permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import { StaffService } from '../staff/staff.service';
import { CreatePayrollAdjustmentDto } from './dto/create-payroll-adjustment.dto';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { SetCompensationDto } from './dto/set-compensation.dto';
import { PayrollAdjustmentService } from './payroll-adjustment.service';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollReleaseService } from './payroll-release.service';
import { StaffBankAccountService } from './staff-bank-account.service';
import { StaffCompensationService } from './staff-compensation.service';
import { StaffPayoutService } from './staff-payout.service';

@ApiTags('Admin - Payroll')
@ApiBearerAuth('JWT-auth')
@Controller('admin/payroll')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminPayrollController {
    constructor(
        private readonly bankAccountService: StaffBankAccountService,
        private readonly compensationService: StaffCompensationService,
        private readonly engineService: PayrollEngineService,
        private readonly adjustmentService: PayrollAdjustmentService,
        private readonly releaseService: PayrollReleaseService,
        private readonly payoutService: StaffPayoutService,
        private readonly staffService: StaffService,
    ) { }

    // -- Dashboard --------------------------------------------------------

    @Get('dashboard')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'Payroll dashboard stats — outstanding wallet balances, pending/withdrawn totals, failed withdrawals' })
    async dashboard() {
        const data = await this.payoutService.adminDashboardStats();
        return { success: true, message: 'Retrieved successfully', data };
    }

    // -- Compensation -------------------------------------------------------

    @Patch('staff/:staffId/compensation')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: "Set a staff member's ongoing base salary/allowances — recorded in history" })
    @ApiParam({ name: 'staffId' })
    async setCompensation(@Req() req: any, @Param('staffId', ParseUUIDPipe) staffId: string, @Body() dto: SetCompensationDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.compensationService.setCompensation(staffId, dto, actor?.id);
        return { success: true, message: 'Compensation updated successfully', data };
    }

    @Get('staff/:staffId/compensation/history')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: "A staff member's compensation change history" })
    @ApiParam({ name: 'staffId' })
    async getCompensationHistory(@Param('staffId', ParseUUIDPipe) staffId: string) {
        const data = await this.compensationService.getHistory(staffId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    // -- Bank accounts --------------------------------------------------------

    @Get('banks')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'List Nigerian banks (for the bank account picker)' })
    async listBanks() {
        const data = await this.bankAccountService.listBanks();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('bank-accounts/pending')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'Bank account changes awaiting admin approval' })
    async listPendingBankChanges() {
        const data = await this.bankAccountService.listPendingChanges();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('bank-accounts/:staffId')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: "A specific staff member's saved bank account on file, including any pending change awaiting approval" })
    @ApiParam({ name: 'staffId' })
    async getBankAccount(@Param('staffId', ParseUUIDPipe) staffId: string) {
        const data = await this.bankAccountService.getBankAccount(staffId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Patch('bank-accounts/:staffId/approve')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: "Approve a staff member's pending bank account change" })
    @ApiParam({ name: 'staffId' })
    async approveBankChange(@Param('staffId', ParseUUIDPipe) staffId: string) {
        const data = await this.bankAccountService.approveChange(staffId);
        return { success: true, message: 'Bank account change approved successfully', data };
    }

    @Patch('bank-accounts/:staffId/reject')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: "Reject a staff member's pending bank account change" })
    @ApiParam({ name: 'staffId' })
    async rejectBankChange(@Param('staffId', ParseUUIDPipe) staffId: string) {
        const data = await this.bankAccountService.rejectChange(staffId);
        return { success: true, message: 'Bank account change rejected successfully', data };
    }

    // -- Payroll periods --------------------------------------------------------

    @Post('periods')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: 'Create a new payroll period' })
    async createPeriod(@Req() req: any, @Body() dto: CreatePayrollPeriodDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.engineService.createPeriod(dto, actor?.id);
        return { success: true, message: 'Payroll period created successfully', data };
    }

    @Get('periods')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'List all payroll periods' })
    async listPeriods() {
        const data = await this.engineService.listPeriods();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('periods/:id')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'Get a payroll period with every generated payslip' })
    @ApiParam({ name: 'id' })
    async getPeriod(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.engineService.getPeriod(id);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post('periods/:id/generate')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: 'Run the payroll engine for this period — generates payslips and credits every staff wallet (still locked until Payday is switched on)' })
    @ApiParam({ name: 'id' })
    async generatePayroll(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.engineService.generatePayroll(id, actor?.id);
        return { success: true, message: 'Payroll generated and wallets credited successfully', data };
    }

    @Patch('periods/:id/approve')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: 'Formally approve an already-generated payroll period' })
    @ApiParam({ name: 'id' })
    async approvePeriod(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.releaseService.approvePeriod(id, actor?.id);
        return { success: true, message: 'Payroll period approved successfully', data };
    }

    // -- Adjustments --------------------------------------------------------

    @Post('periods/:periodId/adjustments')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: 'Add a manual bonus or deduction to a staff member for this period' })
    @ApiParam({ name: 'periodId' })
    async createAdjustment(@Req() req: any, @Param('periodId', ParseUUIDPipe) periodId: string, @Body() dto: CreatePayrollAdjustmentDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.adjustmentService.create(dto, periodId, actor?.id);
        return { success: true, message: 'Adjustment recorded successfully', data };
    }

    @Get('periods/:periodId/adjustments')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'List all adjustments recorded for this period' })
    @ApiParam({ name: 'periodId' })
    async listAdjustments(@Param('periodId', ParseUUIDPipe) periodId: string) {
        const data = await this.adjustmentService.listForPeriod(periodId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Delete('adjustments/:id')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: 'Remove an adjustment — only while its period is still in DRAFT' })
    @ApiParam({ name: 'id' })
    async removeAdjustment(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.adjustmentService.remove(id);
        return { success: true, message: 'Adjustment removed successfully', data };
    }

    // -- Payday switch --------------------------------------------------------

    @Get('settings')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'Get payroll settings — the Payday switch and the pension rate' })
    async getSettings() {
        const data = await this.releaseService.getSettings();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Patch('settings/release')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: 'Turn the Payday switch on or off — ON immediately unlocks withdrawal of every current wallet balance' })
    async setRelease(@Body('active') active: boolean) {
        const data = await this.releaseService.setReleaseActive(active);
        return { success: true, message: `Payday switched ${active ? 'on' : 'off'} successfully`, data };
    }

    @Patch('settings/pension-rate')
    @Permission(PERMISSIONS.PAYROLL_MANAGE)
    @ApiOperation({ summary: 'Update the pension contribution rate used by the payroll engine' })
    async setPensionRate(@Body('rate') rate: number) {
        const data = await this.releaseService.setPensionRate(rate);
        return { success: true, message: 'Pension rate updated successfully', data };
    }

    // -- Withdrawals --------------------------------------------------------

    @Get('withdrawals')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'List all staff withdrawal requests, optionally filtered by status' })
    async listWithdrawals(@Query('status') status?: string) {
        const data = await this.payoutService.adminListWithdrawals(status);
        return { success: true, message: 'Retrieved successfully', data };
    }
}