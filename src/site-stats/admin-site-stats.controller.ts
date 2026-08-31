import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { StaffService } from '../staff/staff.service';
import { SiteStatsService } from './site-stats.service';
import { SetSiteStatsDto } from './dto/set-site-stats.dto';

@ApiTags('Admin - Site Stats')
@ApiBearerAuth('JWT-auth')
@Controller('admin/site-stats')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminSiteStatsController {
    constructor(
        private readonly siteStatsService: SiteStatsService,
        private readonly staffService: StaffService,
    ) { }

    @Get()
    @Permission(PERMISSIONS.SITE_STATS_MANAGE)
    @ApiOperation({ summary: 'The live-computed figure and the current override, side by side, for each of the 5 homepage stats' })
    async getStats() {
        const data = await this.siteStatsService.getAdminView();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Patch()
    @Permission(PERMISSIONS.SITE_STATS_MANAGE)
    @ApiOperation({ summary: 'Set (or clear, by sending null) an override for one or more homepage stats' })
    async setStats(@Req() req: any, @Body() dto: SetSiteStatsDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.siteStatsService.setOverrides(dto, actor?.id);
        return { success: true, message: 'Stats updated successfully', data };
    }
}