import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
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
import { ApplicationService } from './application.service';
import { QueryApplicationDto } from './dto/query-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { ConvertToStaffDto } from './dto/convert-to-staff.dto';

@ApiTags('Admin - Applications')
@ApiBearerAuth('JWT-auth')
@Controller('admin/applications')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Get()
  @ApiOperation({
    summary: 'List applications',
    description: 'Paginated list with filters for status, preferred location, and job.',
  })
  @ApiResponse({ status: 200, description: 'Applications retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing application:read permission' })
  @Permission(PERMISSIONS.APPLICATION_READ)
  async findAll(@Query() queryDto: QueryApplicationDto) {
    const data = await this.applicationService.findAll(queryDto);
    return { success: true, message: 'Applications retrieved successfully', data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one application' })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiResponse({ status: 200, description: 'Application retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing application:read permission' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  @Permission(PERMISSIONS.APPLICATION_READ)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.applicationService.findOne(id);
    return { success: true, message: 'Application retrieved successfully', data };
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update application status',
    description: 'Transitions status. EMPLOYED cannot be set here — use /convert-to-staff instead.',
  })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiResponse({ status: 200, description: 'Application status updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed, or attempted to set EMPLOYED directly' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing application:manage_status permission' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  @Permission(PERMISSIONS.APPLICATION_MANAGE_STATUS)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    const data = await this.applicationService.updateStatus(id, dto);
    return { success: true, message: 'Application status updated successfully', data };
  }

  @Post(':id/schedule-interview')
  @ApiOperation({ summary: 'Schedule an interview for an applicant' })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiResponse({ status: 200, description: 'Interview scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing application:manage_status permission' })
  @ApiResponse({ status: 404, description: 'Application or location not found' })
  @Permission(PERMISSIONS.APPLICATION_MANAGE_STATUS)
  async scheduleInterview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleInterviewDto,
  ) {
    const data = await this.applicationService.scheduleInterview(id, dto);
    return { success: true, message: 'Interview scheduled successfully', data };
  }

  @Post(':id/convert-to-staff')
  @ApiOperation({
    summary: 'Mark an applicant as employed and create their staff record',
    description:
      'Creates a staff record via the staff resource (staff code, opening employment history, etc.) and links it back to this application.',
  })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiResponse({ status: 201, description: 'Staff record created from application successfully' })
  @ApiResponse({ status: 400, description: 'Selected location is inactive' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing application:convert permission' })
  @ApiResponse({ status: 404, description: 'Application or location not found' })
  @ApiResponse({ status: 409, description: 'Already converted, or email already used by another staff record' })
  @Permission(PERMISSIONS.APPLICATION_CONVERT)
  async convertToStaff(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: ConvertToStaffDto,
  @Req() req: any,
) {
  const data = await this.applicationService.convertToStaff(id, dto.locationId, req.user?.id);
  return { success: true, message: 'Applicant converted to staff successfully', data };
}
}