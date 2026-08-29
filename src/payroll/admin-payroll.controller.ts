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
import { CorrectPayrollAdjustmentDto } from './dto/correct-payroll-adjustment.dto';
import { RequestCorrectionDto } from './dto/request-correction.dto';
import { CorrectPayslipDto } from './dto/correct-payslip.dto';
import { PayrollAuditService } from './payroll-audit.service';
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
        private readonly payrollAuditService: PayrollAuditService,
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
    @Permission(PERMISSIONS.PAYROLL_MANAGE_COMPENSATION)
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
    @Permission(PERMISSIONS.PAYROLL_APPROVE_BANK_CHANGE)
    @ApiOperation({ summary: "Approve a staff member's pending bank account change" })
    @ApiParam({ name: 'staffId' })
    async approveBankChange(@Param('staffId', ParseUUIDPipe) staffId: string) {
        const data = await this.bankAccountService.approveChange(staffId);
        return { success: true, message: 'Bank account change approved successfully', data };
    }

    @Patch('bank-accounts/:staffId/reject')
    @Permission(PERMISSIONS.PAYROLL_APPROVE_BANK_CHANGE)
    @ApiOperation({ summary: "Reject a staff member's pending bank account change" })
    @ApiParam({ name: 'staffId' })
    async rejectBankChange(@Param('staffId', ParseUUIDPipe) staffId: string) {
        const data = await this.bankAccountService.rejectChange(staffId);
        return { success: true, message: 'Bank account change rejected successfully', data };
    }

    // -- Payroll periods --------------------------------------------------------

    @Post('periods')
    @Permission(PERMISSIONS.PAYROLL_CREATE_PERIOD)
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
    @Permission(PERMISSIONS.PAYROLL_GENERATE)
    @ApiOperation({ summary: 'Run the payroll engine for this period — generates payslips and credits every staff wallet (still locked until Payday is switched on)' })
    @ApiParam({ name: 'id' })
    async generatePayroll(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.engineService.generatePayroll(id, actor?.id);
        return { success: true, message: 'Payroll generated and wallets credited successfully', data };
    }

    @Patch('periods/:id/approve')
    @Permission(PERMISSIONS.PAYROLL_APPROVE_PERIOD)
    @ApiOperation({ summary: 'Formally approve an already-generated payroll period' })
    @ApiParam({ name: 'id' })
    async approvePeriod(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.releaseService.approvePeriod(id, actor?.id);
        return { success: true, message: 'Payroll period approved successfully', data };
    }

    @Patch('periods/:id/request-correction')
    @Permission(PERMISSIONS.PAYROLL_CORRECT)
    @ApiOperation({
        summary: 'Send an already-generated payroll period back for correction',
        description: 'Reopens an AWAITING_RELEASE period as DRAFT so it can be regenerated -- a deliberately higher-permission action than ordinary payroll management.',
    })
    @ApiParam({ name: 'id' })
    async requestCorrection(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestCorrectionDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.releaseService.requestCorrection(id, actor?.id, dto.note);
        return { success: true, message: 'Payroll period sent back for correction', data };
    }

    @Patch('payslips/:id/correct')
    @Permission(PERMISSIONS.PAYROLL_CORRECT)
    @ApiOperation({
        summary: 'Correct a single, already-published payslip',
        description: 'Retains the original (marked SUPERSEDED) and generates a fresh, recalculated replacement (marked CORRECTED) alongside it -- the original is never mutated or deleted.',
    })
    @ApiParam({ name: 'id' })
    async correctPayslip(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CorrectPayslipDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.engineService.correctPayslip(id, dto.reason, actor?.id);
        return { success: true, message: 'Payslip corrected successfully', data };
    }

    // -- Adjustments --------------------------------------------------------

    @Post('periods/:periodId/adjustments')
    @Permission(PERMISSIONS.PAYROLL_MANAGE_ADJUSTMENTS)
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
    @Permission(PERMISSIONS.PAYROLL_MANAGE_ADJUSTMENTS)
    @ApiOperation({ summary: 'Remove an adjustment — only while its period is still in DRAFT' })
    @ApiParam({ name: 'id' })
    async removeAdjustment(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.adjustmentService.remove(id, actor?.id);
        return { success: true, message: 'Adjustment removed successfully', data };
    }

    @Patch('adjustments/:id/correct')
    @Permission(PERMISSIONS.PAYROLL_MANAGE_ADJUSTMENTS)
    @ApiOperation({
        summary: "Correct an adjustment's amount",
        description: 'Dev Feedback Round 5, item #3. The original is kept (marked SUPERSEDED, not deleted) and a new row is created with the revised amount -- the full audit trail (original amount, revised amount, reason, user, timestamp) is always visible via GET adjustments/:id/history. Only available once the period is past DRAFT -- edit a still-draft adjustment directly instead.',
    })
    @ApiParam({ name: 'id' })
    async correctAdjustment(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CorrectPayrollAdjustmentDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.adjustmentService.correct(id, dto.amount, dto.correctionReason, actor?.id);
        return { success: true, message: 'Adjustment corrected successfully', data };
    }

    @Get('adjustments/:id/history')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'Full correction chain for one adjustment -- the original plus every correction issued against it, oldest first' })
    @ApiParam({ name: 'id' })
    async getAdjustmentHistory(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.adjustmentService.getCorrectionHistory(id);
        return { success: true, message: 'Retrieved successfully', data };
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
    @Permission(PERMISSIONS.PAYROLL_MANAGE_SETTINGS)
    @ApiOperation({ summary: 'Turn the Payday switch on or off — ON immediately unlocks withdrawal of every current wallet balance' })
    async setRelease(@Body('active') active: boolean) {
        const data = await this.releaseService.setReleaseActive(active);
        return { success: true, message: `Payday switched ${active ? 'on' : 'off'} successfully`, data };
    }

    @Patch('settings/pension-rate')
    @Permission(PERMISSIONS.PAYROLL_MANAGE_SETTINGS)
    @ApiOperation({ summary: 'Update the pension contribution rate used by the payroll engine' })
    async setPensionRate(@Body('rate') rate: number) {
        const data = await this.releaseService.setPensionRate(rate);
        return { success: true, message: 'Pension rate updated successfully', data };
    }

    // -- Withdrawals --------------------------------------------------------

    @Get('withdrawals')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'List staff withdrawal requests, filterable by status, staff, branch, and date range' })
    async listWithdrawals(
        @Query('status') status?: string,
        @Query('staffId') staffId?: string,
        @Query('locationId') locationId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const data = await this.payoutService.adminListWithdrawals({
            status, staffId, locationId, from, to,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
        return { success: true, message: 'Retrieved successfully', data };
    }

    // -- Audit log ------------------------------------------------------------

    @Get('audit-log')
    @Permission(PERMISSIONS.PAYROLL_READ)
    @ApiOperation({ summary: 'View the payroll audit trail, filterable by entity, staff, actor, and action' })
    async getAuditLog(
        @Query('entityType') entityType?: string,
        @Query('entityId') entityId?: string,
        @Query('staffId') staffId?: string,
        @Query('actorId') actorId?: string,
        @Query('action') action?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const data = await this.payrollAuditService.findAll({
            entityType, entityId, staffId, actorId, action,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
        return { success: true, message: 'Retrieved successfully', data };
    }
}