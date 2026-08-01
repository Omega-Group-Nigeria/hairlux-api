import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { QueryCommsMetricsDto } from './dto/query-comms-metrics.dto';
import { CommsAdminService } from './services/comms-admin.service';

@ApiTags('Admin – Comms')
@ApiBearerAuth('JWT-auth')
@Controller('admin/comms')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminCommsController {
  constructor(private readonly commsAdmin: CommsAdminService) {}

  @Get('metrics')
  @Permission(PERMISSIONS.BOOKINGS_READ)
  @ApiOperation({ summary: 'Comms ops metrics (sessions and audit events)' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved' })
  async getMetrics(@Query() query: QueryCommsMetricsDto) {
    const data = await this.commsAdmin.getMetrics(query);

    return {
      success: true,
      message: 'Comms metrics retrieved successfully',
      data,
    };
  }
}