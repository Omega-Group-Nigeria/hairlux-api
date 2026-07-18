import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
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
import { GetUser } from '../auth/decorators/get-user.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { BeauticianAdminService } from './services/beautician-admin.service';
import { BeauticianProfileService } from './services/beautician-profile.service';
import { BeauticianServiceAssignmentService } from './services/beautician-service-assignment.service';
import { BeauticianAvailabilityService } from './services/beautician-availability.service';
import { KycStatusService } from './kyc/services/kyc-status.service';
import { QueryBeauticiansDto } from './dto/query-beauticians.dto';
import { QueryPendingProfileReviewsDto } from './dto/query-pending-profile-reviews.dto';
import {
  ApproveProfileDto,
  AssignBeauticianServicesDto,
  RejectKycDto,
  RejectProfileDto,
  UpdateAdminBeauticianDto,
} from './dto/admin-beautician.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { PerformanceQueryDto } from './dto/performance-query.dto';
import { QueryBeauticianReviewsDto } from './dto/query-beautician-reviews.dto';
import { BeauticianPerformanceService } from './admin/services/beautician-performance.service';
import { AdminBeauticianReviewsService } from './admin/services/admin-beautician-reviews.service';
import { DispatchAdminService } from './matching/services/dispatch-admin.service';
import { UpdateBeauticianDispatchDto } from './matching/dto/update-beautician-dispatch.dto';

@ApiTags('Admin – Beauticians')
@ApiBearerAuth('JWT-auth')
@Controller('admin/beauticians')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminBeauticianController {
  constructor(
    private readonly adminService: BeauticianAdminService,
    private readonly profileService: BeauticianProfileService,
    private readonly assignmentService: BeauticianServiceAssignmentService,
    private readonly kycStatusService: KycStatusService,
    private readonly performanceService: BeauticianPerformanceService,
    private readonly reviewsService: AdminBeauticianReviewsService,
    private readonly dispatchAdminService: DispatchAdminService,
    private readonly availabilityService: BeauticianAvailabilityService,
  ) {}

  @Get()
  @Permission(PERMISSIONS.BEAUTICIANS_READ)
  @ApiOperation({ summary: 'List beauticians with filters' })
  async findAll(@Query() query: QueryBeauticiansDto) {
    const data = await this.adminService.findAll(query);
    return {
      success: true,
      message: 'Beauticians retrieved successfully',
      data,
    };
  }

  @Get('pending-profile-reviews')
  @Permission(PERMISSIONS.BEAUTICIANS_REVIEW)
  @ApiOperation({ summary: 'List beauticians awaiting profile review' })
  async findPendingProfileReviews(
    @Query() query: QueryPendingProfileReviewsDto,
  ) {
    const data = await this.adminService.findPendingProfileReviews(query);
    return {
      success: true,
      message: 'Pending profile reviews retrieved successfully',
      data,
    };
  }

  @Get('performance')
  @Permission(PERMISSIONS.BEAUTICIANS_READ)
  @ApiOperation({
    summary: 'Beautician performance summary',
    description: 'Aggregate KPIs for the period — no per-beautician breakdown.',
  })
  async getPerformance(@Query() query: PerformanceQueryDto) {
    const data = await this.performanceService.getSummary(query.periodDays);
    return {
      success: true,
      message: 'Performance summary retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @Permission(PERMISSIONS.BEAUTICIANS_READ)
  @ApiOperation({ summary: 'Get beautician details' })
  @ApiParam({ name: 'id', description: 'Beautician profile ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adminService.findOne(id);
    return {
      success: true,
      message: 'Beautician retrieved successfully',
      data,
    };
  }

  @Get(':id/reviews')
  @Permission(PERMISSIONS.BEAUTICIANS_READ)
  @ApiOperation({
    summary: 'List customer reviews for a beautician',
    description:
      'Paginated service reviews linked via completed bookings assigned to this beautician. Filter by rating range and review status; sort by rating or created date.',
  })
  @ApiParam({ name: 'id', description: 'Beautician profile ID' })
  async listReviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryBeauticianReviewsDto,
  ) {
    const data = await this.reviewsService.listForProfile(id, query);
    return {
      success: true,
      message: 'Beautician reviews retrieved successfully',
      data,
    };
  }

  @Patch(':id/dispatch')
  @Permission(PERMISSIONS.BEAUTICIANS_MANAGE)
  @ApiOperation({
    summary:
      'Suspend or re-enable beautician from dispatch matching (optional timed probation)',
    description:
      'Suspended beauticians are removed from the geo index and excluded from new offers. ' +
      'Pass `until` (ISO datetime) or `durationHours` for timed probation that auto-unsuspends; omit both for indefinite suspension. ' +
      'A notification email is sent on suspend and on reinstate (manual or automatic).',
  })
  async updateDispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBeauticianDispatchDto,
  ) {
    const data = await this.dispatchAdminService.updateDispatchSuspension(
      id,
      dto,
    );
    return {
      success: true,
      message: data.message,
      data,
    };
  }

  @Patch(':id/availability')
  @Permission(PERMISSIONS.BEAUTICIANS_MANAGE)
  @ApiOperation({
    summary: 'Set beautician availability ONLINE or OFFLINE',
    description:
      'Admin force-set of availability. Going OFFLINE cancels pending offers and removes the beautician from the online geo index. Going ONLINE re-indexes location when available and may re-trigger pending booking matching.',
  })
  @ApiParam({ name: 'id', description: 'Beautician profile ID' })
  async updateAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    const data = await this.availabilityService.adminUpdateAvailability(
      id,
      dto.status,
    );
    return {
      success: true,
      message: data.message,
      data,
    };
  }

  @Patch(':id')
  @Permission(PERMISSIONS.BEAUTICIANS_MANAGE)
  @ApiOperation({ summary: 'Update beautician admin fields' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminBeauticianDto,
  ) {
    const data = await this.adminService.update(id, dto);
    return {
      success: true,
      message: 'Beautician updated successfully',
      data,
    };
  }

  @Patch(':id/kyc/approve')
  @Permission(PERMISSIONS.BEAUTICIANS_REVIEW)
  @ApiOperation({ summary: 'Manually approve KYC' })
  async approveKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') adminUserId: string,
  ) {
    const data = await this.kycStatusService.adminApprove(id, adminUserId);
    return { success: true, message: 'KYC approved successfully', data };
  }

  @Patch(':id/kyc/reject')
  @Permission(PERMISSIONS.BEAUTICIANS_REVIEW)
  @ApiOperation({ summary: 'Reject KYC with reason' })
  async rejectKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectKycDto,
  ) {
    const data = await this.kycStatusService.adminReject(id, dto.reason);
    return { success: true, message: 'KYC rejected successfully', data };
  }

  @Patch(':id/profile/approve')
  @Permission(PERMISSIONS.BEAUTICIANS_REVIEW)
  @ApiOperation({ summary: 'Approve professional profile after evaluation' })
  async approveProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') adminUserId: string,
    @Body() dto: ApproveProfileDto,
  ) {
    const data = await this.profileService.approveProfile(
      id,
      adminUserId,
      dto.notes,
    );
    return {
      success: true,
      message: 'Profile approved successfully',
      data,
    };
  }

  @Patch(':id/profile/reject')
  @Permission(PERMISSIONS.BEAUTICIANS_REVIEW)
  @ApiOperation({ summary: 'Reject professional profile with reason' })
  async rejectProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') adminUserId: string,
    @Body() dto: RejectProfileDto,
  ) {
    const data = await this.profileService.rejectProfile(
      id,
      adminUserId,
      dto.reason,
      dto.notes,
    );
    return {
      success: true,
      message: 'Profile rejected successfully',
      data,
    };
  }

  @Get(':id/services')
  @Permission(PERMISSIONS.BEAUTICIANS_ASSIGN_SERVICES)
  @ApiOperation({ summary: 'Get services assigned to beautician' })
  async getAssignedServices(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.assignmentService.getAssignedServices(id);
    return {
      success: true,
      message: 'Assigned services retrieved successfully',
      data,
    };
  }

  @Put(':id/services')
  @Permission(PERMISSIONS.BEAUTICIANS_ASSIGN_SERVICES)
  @ApiOperation({ summary: 'Assign eligible home services to beautician' })
  async assignServices(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') adminUserId: string,
    @Body() dto: AssignBeauticianServicesDto,
  ) {
    const data = await this.assignmentService.assignServices(
      id,
      dto.serviceIds,
      adminUserId,
    );
    return {
      success: true,
      message: 'Beautician services updated successfully',
      data,
    };
  }
}