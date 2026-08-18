import { Body, Controller, Post, Get, Patch, Delete, Param, ParseUUIDPipe, UseGuards, Query, Req } from '@nestjs/common';
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
import { StaffCommsService } from './staff-comms.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { CreateDirectiveDto, BulkCreateDirectivesDto } from './dto/create-directive.dto';
import { UpdateDirectiveDto } from './dto/update-directive.dto';

@ApiTags('Admin - Staff Comms')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminStaffCommsController {
  constructor(private readonly commsService: StaffCommsService) {}


  @Get('announcements')
  @Permission(PERMISSIONS.STAFF_READ)
  async getAllAnnouncements() {
    const data = await this.commsService.getAllAnnouncements();
    return { success: true, message: 'Announcements retrieved successfully', data };
  }

  @Post('announcements')
  @ApiOperation({
    summary: 'Broadcast an announcement to all staff, one branch, or one individual',
  })
  @ApiResponse({ status: 201, description: 'Announcement created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing staff:update permission' })
  @ApiResponse({ status: 404, description: 'Target branch or staff member not found' })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async createAnnouncement(@Body() dto: CreateAnnouncementDto, @Req() req: any) {
    const data = await this.commsService.createAnnouncement(dto, req.user?.id);
    return { success: true, message: 'Announcement created successfully', data };
  }

  @Patch('announcements/:id')
  @ApiOperation({ summary: 'Edit an existing announcement — title, body, audience, or expiry' })
  @ApiResponse({ status: 200, description: 'Announcement updated successfully' })
  @ApiResponse({ status: 404, description: 'Announcement, target branch, or target staff member not found' })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async updateAnnouncement(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnnouncementDto) {
    const data = await this.commsService.updateAnnouncement(id, dto);
    return { success: true, message: 'Announcement updated successfully', data };
  }

  @Delete('announcements/:id')
  @ApiOperation({ summary: 'Permanently delete an announcement' })
  @ApiResponse({ status: 200, description: 'Announcement deleted successfully' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async deleteAnnouncement(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.commsService.deleteAnnouncement(id);
    return { success: true, message: 'Announcement deleted successfully', data };
  }

  @Get('directives')
  @Permission(PERMISSIONS.STAFF_READ)
  async getAllDirectives(
    @Query('status') status?: string,
    @Query('targetStaffId') targetStaffId?: string,
    @Query('locationId') locationId?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('dueAfter') dueAfter?: string,
  ) {
    const data = await this.commsService.getAllDirectives({ status, targetStaffId, locationId, dueBefore, dueAfter });
    return { success: true, message: 'Directives retrieved successfully', data };
  }

  @Post('directives')
  @ApiOperation({
    summary: 'Send a directive to one staff member, or fan it out to a whole branch',
    description:
      'Provide exactly one of targetStaffId or targetLocationId. A branch ' +
      'target creates one independent row per active staff member there -- ' +
      'each person tracks their own status separately.',
  })
  @ApiResponse({ status: 201, description: 'Directive(s) created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed, or no active staff at that branch' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing staff:update permission' })
  @ApiResponse({ status: 404, description: 'Target branch or staff member not found' })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async createDirective(@Body() dto: CreateDirectiveDto, @Req() req: any) {
    const data = await this.commsService.createDirective(dto, req.user?.id);
    return { success: true, message: 'Directive(s) created successfully', data };
  }

  @Post('directives/bulk')
  @ApiOperation({
    summary: 'Send several distinct tasks at once, each independently targeted to a person or a branch',
    description:
      'Each entry in tasks[] follows the exact same individual-or-branch ' +
      'rule as a single directive. One entry failing does not roll back ' +
      'the others -- check failedCount/failed in the response.',
  })
  @ApiResponse({ status: 201, description: 'Batch processed -- see succeededCount/failedCount in the response' })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async bulkCreateDirectives(@Body() dto: BulkCreateDirectivesDto, @Req() req: any) {
    const data = await this.commsService.bulkCreateDirectives(dto, req.user?.id);
    return { success: true, message: 'Batch processed', data };
  }

  @Patch('directives/:id')
  @ApiOperation({
    summary: 'Edit a directive — title, instructions, or due date',
    description: 'Edits exactly this one row. A branch-fanned batch has no shared parent, so this never edits the whole original batch at once.',
  })
  @ApiResponse({ status: 200, description: 'Directive updated successfully' })
  @ApiResponse({ status: 404, description: 'Directive not found' })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async updateDirective(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDirectiveDto) {
    const data = await this.commsService.updateDirective(id, dto);
    return { success: true, message: 'Directive updated successfully', data };
  }

  @Delete('directives/:id')
  @ApiOperation({ summary: 'Permanently delete a directive' })
  @ApiResponse({ status: 200, description: 'Directive deleted successfully' })
  @ApiResponse({ status: 404, description: 'Directive not found' })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async deleteDirective(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.commsService.deleteDirective(id);
    return { success: true, message: 'Directive deleted successfully', data };
  }

  @Get('directives/:id/evidence')
  @ApiOperation({ summary: "Get a fresh view URL for a staff member's submitted evidence on this directive" })
  @ApiResponse({ status: 200, description: 'View URL retrieved successfully (null if no evidence submitted)' })
  @ApiResponse({ status: 404, description: 'Directive not found' })
  @Permission(PERMISSIONS.STAFF_READ)
  async getDirectiveEvidence(@Param('id', ParseUUIDPipe) id: string) {
    const viewUrl = await this.commsService.getDirectiveEvidenceViewUrl(id);
    return { success: true, message: 'View URL retrieved successfully', data: { viewUrl } };
  }
}