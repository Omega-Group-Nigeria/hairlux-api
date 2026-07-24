import { Body, Controller, Post, Get, UseGuards, Query, Req } from '@nestjs/common';
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
import { CreateDirectiveDto } from './dto/create-directive.dto';

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

  @Get('directives')
  @Permission(PERMISSIONS.STAFF_READ)
  async getAllDirectives(@Query('status') status?: string) {
    const data = await this.commsService.getAllDirectives({ status });
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
}