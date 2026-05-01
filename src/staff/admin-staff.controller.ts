import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
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
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto';
import { AddEmploymentHistoryDto } from './dto/add-employment-history.dto';
import { UpdateEmploymentHistoryDto } from './dto/update-employment-history.dto';
import { QueryUpcomingBirthdaysDto } from './dto/query-upcoming-birthdays.dto';
import { ArchiveStaffDto } from './dto/archive-staff.dto';
import { CreateStaffLocationDto } from './dto/create-staff-location.dto';
import { QueryStaffLocationsDto } from './dto/query-staff-locations.dto';
import { UpdateStaffLocationDto } from './dto/update-staff-location.dto';

@ApiTags('Admin - Staff')
@ApiBearerAuth('JWT-auth')
@Controller('admin/staff')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminStaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a staff record',
    description:
      'Creates a staff profile with opening employment history entry using locationId.',
  })
  @ApiResponse({
    status: 201,
    description: 'Staff record created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or selected location is inactive',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:create permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Referenced location was not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already used by another staff record',
  })
  @Permission(PERMISSIONS.STAFF_CREATE)
  async create(@Body() dto: CreateStaffDto) {
    const data = await this.staffService.create(dto);
    return {
      success: true,
      message: 'Staff record created successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List staff records',
    description:
      'Returns paginated staff list with filters for active and archived/former records.',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff records retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:read permission',
  })
  @Permission(PERMISSIONS.STAFF_READ)
  async findAll(@Query() queryDto: QueryStaffDto) {
    const data = await this.staffService.findAll(queryDto);
    return {
      success: true,
      message: 'Staff records retrieved successfully',
      data,
    };
  }

  @Get('birthdays/upcoming')
  @ApiOperation({
    summary: 'Get upcoming birthdays',
    description: 'Returns upcoming staff birthdays within a configured window.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upcoming birthdays retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:read permission',
  })
  @Permission(PERMISSIONS.STAFF_READ)
  async getUpcomingBirthdays(@Query() queryDto: QueryUpcomingBirthdaysDto) {
    const data = await this.staffService.getUpcomingBirthdays(queryDto);
    return {
      success: true,
      message: 'Upcoming birthdays retrieved successfully',
      data,
    };
  }

  @Post('locations')
  @ApiOperation({
    summary: 'Create staff location',
    description: 'Creates a managed location that can be assigned to staff.',
  })
  @ApiResponse({
    status: 201,
    description: 'Staff location created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:manage_locations permission',
  })
  @ApiResponse({
    status: 409,
    description: 'A location with this name already exists',
  })
  @Permission(PERMISSIONS.STAFF_MANAGE_LOCATIONS)
  async createLocation(@Body() dto: CreateStaffLocationDto) {
    const data = await this.staffService.createLocation(dto);
    return {
      success: true,
      message: 'Staff location created successfully',
      data,
    };
  }

  @Get('locations')
  @ApiOperation({
    summary: 'List staff locations',
    description: 'Returns active or all managed staff locations.',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff locations retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:read permission',
  })
  @Permission(PERMISSIONS.STAFF_READ)
  async findAllLocations(@Query() queryDto: QueryStaffLocationsDto) {
    const data = await this.staffService.findAllLocations(queryDto);
    return {
      success: true,
      message: 'Staff locations retrieved successfully',
      data,
    };
  }

  @Patch('locations/:id')
  @ApiOperation({
    summary: 'Update staff location',
    description: 'Updates location name and activation state.',
  })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({
    status: 200,
    description: 'Staff location updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:manage_locations permission',
  })
  @ApiResponse({ status: 404, description: 'Location not found' })
  @ApiResponse({
    status: 409,
    description: 'Location name already exists or location has active staff',
  })
  @Permission(PERMISSIONS.STAFF_MANAGE_LOCATIONS)
  async updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffLocationDto,
  ) {
    const data = await this.staffService.updateLocation(id, dto);
    return {
      success: true,
      message: 'Staff location updated successfully',
      data,
    };
  }

  @Delete('locations/:id')
  @ApiOperation({
    summary: 'Delete staff location',
    description: 'Deletes an unused managed location.',
  })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({
    status: 200,
    description: 'Staff location deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:manage_locations permission',
  })
  @ApiResponse({ status: 404, description: 'Location not found' })
  @ApiResponse({
    status: 409,
    description: 'Location is in use by staff records',
  })
  @Permission(PERMISSIONS.STAFF_MANAGE_LOCATIONS)
  async deleteLocation(@Param('id', ParseUUIDPipe) id: string) {
    await this.staffService.deleteLocation(id);
    return {
      success: true,
      message: 'Staff location deleted successfully',
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one staff record with employment history' })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({
    status: 200,
    description: 'Staff record retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:read permission',
  })
  @ApiResponse({ status: 404, description: 'Staff record not found' })
  @Permission(PERMISSIONS.STAFF_READ)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.staffService.findOne(id);
    return {
      success: true,
      message: 'Staff record retrieved successfully',
      data,
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update staff profile fields',
    description: 'Updates staff profile and contact details.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({
    status: 200,
    description: 'Staff record updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or selected location is inactive',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:update permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Staff record or location not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already used by another staff record',
  })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    const data = await this.staffService.update(id, dto);
    return {
      success: true,
      message: 'Staff record updated successfully',
      data,
    };
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update staff employment status',
    description:
      'Changes employment status and captures exit details where applicable.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({
    status: 200,
    description: 'Staff status updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:manage_status permission',
  })
  @ApiResponse({ status: 404, description: 'Staff record not found' })
  @Permission(PERMISSIONS.STAFF_MANAGE_STATUS)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffStatusDto,
  ) {
    const data = await this.staffService.updateStatus(id, dto);
    return {
      success: true,
      message: 'Staff status updated successfully',
      data,
    };
  }

  @Post(':id/archive')
  @ApiOperation({
    summary: 'Archive a staff record',
    description:
      'Soft-archives former employees while keeping records accessible.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({
    status: 200,
    description: 'Staff record archived successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:archive permission',
  })
  @ApiResponse({ status: 404, description: 'Staff record not found' })
  @Permission(PERMISSIONS.STAFF_ARCHIVE)
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveStaffDto,
  ) {
    const data = await this.staffService.archive(
      id,
      dto.reasonForExit,
      dto.exitDate,
    );
    return {
      success: true,
      message: 'Staff record archived successfully',
      data,
    };
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived staff record' })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({
    status: 200,
    description: 'Staff record restored successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:archive permission',
  })
  @ApiResponse({ status: 404, description: 'Staff record not found' })
  @Permission(PERMISSIONS.STAFF_ARCHIVE)
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.staffService.restore(id);
    return {
      success: true,
      message: 'Staff record restored successfully',
      data,
    };
  }

  @Post(':id/history')
  @ApiOperation({
    summary: 'Add employment history entry',
    description:
      'Adds a new role/location period. Existing open history is automatically closed.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({
    status: 201,
    description: 'Employment history added successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or invalid date ordering',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:update permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Staff record or location not found',
  })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async addEmploymentHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddEmploymentHistoryDto,
  ) {
    const data = await this.staffService.addEmploymentHistory(id, dto);
    return {
      success: true,
      message: 'Employment history added successfully',
      data,
    };
  }

  @Patch(':id/history/:historyId')
  @ApiOperation({ summary: 'Update an employment history entry' })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiParam({ name: 'historyId', description: 'Employment history ID' })
  @ApiResponse({
    status: 200,
    description: 'Employment history updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or invalid date ordering',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:update permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Staff, location, or history record not found',
  })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async updateEmploymentHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('historyId', ParseUUIDPipe) historyId: string,
    @Body() dto: UpdateEmploymentHistoryDto,
  ) {
    const data = await this.staffService.updateEmploymentHistory(
      id,
      historyId,
      dto,
    );
    return {
      success: true,
      message: 'Employment history updated successfully',
      data,
    };
  }

  @Delete(':id/history/:historyId')
  @ApiOperation({ summary: 'Delete a past employment history entry' })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiParam({ name: 'historyId', description: 'Employment history ID' })
  @ApiResponse({
    status: 200,
    description: 'Employment history removed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete the current active history record',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:update permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Staff or history record not found',
  })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async removeEmploymentHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('historyId', ParseUUIDPipe) historyId: string,
  ) {
    await this.staffService.removeEmploymentHistory(id, historyId);
    return {
      success: true,
      message: 'Employment history removed successfully',
    };
  }
}
