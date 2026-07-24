import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
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
import { StaffOperationsService } from './staff-operations.service';

@ApiTags('Admin - Attendance & Inventory (Phase 3 Prototype)')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminStaffOperationsController {
  constructor(private readonly operationsService: StaffOperationsService) {}

  @Get('attendance')
  @ApiOperation({ summary: 'Attendance report -- who checked in/out, when, at which branch' })
  @ApiQuery({ name: 'date', required: false, example: '2026-07-22' })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiResponse({ status: 200, description: 'Attendance report retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing staff:read permission' })
  @Permission(PERMISSIONS.STAFF_READ)
  async getAttendanceReport(
    @Query('date') date?: string,
    @Query('locationId') locationId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const data = await this.operationsService.getAttendanceReport({ date, locationId, staffId });
    return { success: true, message: 'Attendance report retrieved successfully', data };
  }

  @Get('inventory/dashboard')
  @ApiOperation({
    summary: 'Running stock total per branch/product (prototype-level, computed from the log)',
  })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiResponse({ status: 200, description: 'Inventory dashboard retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing staff:read permission' })
  @Permission(PERMISSIONS.STAFF_READ)
  async getInventoryDashboard(@Query('locationId') locationId?: string) {
    const data = await this.operationsService.getInventoryDashboard(locationId);
    return { success: true, message: 'Inventory dashboard retrieved successfully', data };
  }

  @Get('inventory/entries')
  @ApiOperation({ summary: 'Raw inventory log entries, filterable' })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'productName', required: false })
  @ApiResponse({ status: 200, description: 'Inventory entries retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing staff:read permission' })
  @Permission(PERMISSIONS.STAFF_READ)
  async getInventoryEntries(
    @Query('locationId') locationId?: string,
    @Query('productName') productName?: string,
  ) {
    const data = await this.operationsService.getInventoryEntries({ locationId, productName });
    return { success: true, message: 'Inventory entries retrieved successfully', data };
  }
}