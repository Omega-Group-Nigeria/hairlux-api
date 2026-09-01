import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { BranchFinanceService } from './branch-finance.service';
import { QueryDailySummaryDto } from './dto/query-daily-summary.dto';
import { SubmitReconciliationDto } from './dto/submit-reconciliation.dto';
import { UpdateBranchFinanceSettingsDto } from './dto/update-branch-finance-settings.dto';

/**
 * Deliberately no @Roles restriction here — access is entirely permission-
 * gated (branch_finance:read / branch_finance:reconcile), so a staff member
 * granted that permission via their AdminRole can use this for their own
 * branch, not just ADMIN/SUPER_ADMIN accounts. Whether the caller can
 * switch between branches is decided separately, inside the service, based
 * on their base UserRole.
 */
@ApiTags('Branch Finance')
@ApiBearerAuth('JWT-auth')
@Controller('branch-finance')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BranchFinanceController {
    constructor(private readonly branchFinanceService: BranchFinanceService) { }

    private isAdmin(req: any): boolean {
        return req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    }

    @Get('daily-summary')
    @Permission(PERMISSIONS.BRANCH_FINANCE_READ)
    @ApiOperation({
        summary: "A branch's daily financial summary — booking revenue (walk-in and self-service), product sales, inventory received/transferred, and any submitted cash reconciliation, day by day across a date range",
        description: 'Non-admin callers are locked to their own branch. ADMIN/SUPER_ADMIN must specify branchId and may pass any branch.',
    })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'dateFrom', required: false })
    @ApiQuery({ name: 'dateTo', required: false })
    async getDailySummary(@Req() req: any, @Query() query: QueryDailySummaryDto) {
        const data = await this.branchFinanceService.getDailySummary(
            req.user.id,
            this.isAdmin(req),
            query.branchId,
            query.dateFrom,
            query.dateTo,
        );
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post('reconciliation')
    @Permission(PERMISSIONS.BRANCH_FINANCE_RECONCILE)
    @ApiOperation({
        summary: "Submit (or update) a branch's end-of-day cash count",
        description: 'Expected revenue figures are snapshotted server-side at submission time — the caller only supplies the actual cash counted. Submitting again for the same branch+date overwrites the previous entry.',
    })
    async submitReconciliation(@Req() req: any, @Body() dto: SubmitReconciliationDto) {
        const data = await this.branchFinanceService.submitReconciliation(req.user.id, this.isAdmin(req), dto);
        return { success: true, message: 'Reconciliation submitted successfully', data };
    }

    // Round 6, item #19: relaxed from admin-only -- any staff who can
    // submit a reconciliation needs to know the actual deadline to
    // submit on time (the hardcoded "12:00pm" text this replaced was a
    // staff-facing hint, not an admin-only detail). PATCH below stays
    // admin-only -- reading isn't sensitive, changing it is.
    @Get('settings')
    @Permission(PERMISSIONS.BRANCH_FINANCE_RECONCILE)
    @ApiOperation({ summary: 'The current daily revenue-submission deadline, applied across every branch' })
    async getSettings() {
        const data = await this.branchFinanceService.getSettings();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Patch('settings')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Permission(PERMISSIONS.BRANCH_FINANCE_MANAGE_SETTINGS)
    @ApiOperation({ summary: 'Change the daily revenue-submission deadline' })
    async updateSettings(@Req() req: any, @Body() dto: UpdateBranchFinanceSettingsDto) {
        const data = await this.branchFinanceService.updateSettings(dto.submissionDeadlineTime, req.user.id);
        return { success: true, message: 'Settings updated successfully', data };
    }
}