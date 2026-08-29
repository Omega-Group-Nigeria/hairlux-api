import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { ProfitabilityReportService } from './profitability-report.service';

@ApiTags('Admin - Reports')
@ApiBearerAuth('JWT-auth')
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class AdminReportsController {
    constructor(private readonly profitabilityReportService: ProfitabilityReportService) { }

    @Get('profitability')
    @Permission(PERMISSIONS.REPORTS_READ_PROFITABILITY)
    @ApiOperation({
        summary: 'Revenue, COGS, and gross profit -- combines standalone product sales and FOR_SALE lines on completed bookings',
    })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
    @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
    async getProfitability(
        @Query('branchId') branchId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        const data = await this.profitabilityReportService.getProfitability({
            branchId,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
        });
        return { success: true, message: 'Retrieved successfully', data };
    }
}