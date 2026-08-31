import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { AuditTrailService } from './audit-trail.service';
import { QueryAuditTrailDto } from './dto/query-audit-trail.dto';

@ApiTags('Admin - Audit Trail')
@ApiBearerAuth('JWT-auth')
@Controller('admin/audit-trail')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Permission(PERMISSIONS.AUDIT_TRAIL_READ)
export class AdminAuditTrailController {
    constructor(private readonly auditTrailService: AuditTrailService) { }

    @Get()
    @ApiOperation({ summary: 'System-wide audit trail, merging Role/Payroll/System audit logs into one chronological, filterable view' })
    async findAll(@Query() query: QueryAuditTrailDto) {
        const data = await this.auditTrailService.findAll({
            source: query.source,
            entityType: query.entityType,
            actorId: query.actorId,
            from: query.from ? new Date(query.from) : undefined,
            to: query.to ? new Date(query.to) : undefined,
            page: query.page,
            limit: query.limit,
        });
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('entity-types')
    @ApiOperation({ summary: 'Distinct entityType values currently in use, for a filter dropdown' })
    async listEntityTypes() {
        const data = await this.auditTrailService.listEntityTypes();
        return { success: true, message: 'Retrieved successfully', data };
    }
}