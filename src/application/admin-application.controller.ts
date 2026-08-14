import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
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
import { Permission } from '../auth/decorators/permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import { ApplicationService } from './application.service';
import { ApproveEmploymentDto } from './dto/approve-employment.dto';
import { ConvertToStaffDto } from './dto/convert-to-staff.dto';
import { GenerateOfferLetterDto } from './dto/generate-offer-letter.dto';
import { QueryApplicationDto } from './dto/query-application.dto';
import { RecordInterviewOutcomeDto } from './dto/record-interview-outcome.dto';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { QueryRecruitmentReportDto } from './dto/query-recruitment-report.dto';


@ApiTags('Admin - Applications')
@ApiBearerAuth('JWT-auth')
@Controller('admin/applications')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminApplicationController {
  constructor(private readonly applicationService: ApplicationService) { }

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
    const data = await this.applicationService.findAllForAdmin(queryDto);
    return { success: true, message: 'Applications retrieved successfully', data };
  }

  @Get('report')
  @ApiOperation({
    summary: 'Basic recruitment report — filterable by date range, role, status, and branch',
    description: 'Applicants per role, status breakdown, and average time-to-hire — every card computed over the same filtered set, so e.g. role + status together show the actual filtered hired count, not the global total.',
  })
  @ApiResponse({ status: 200, description: 'Recruitment report retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing application:read permission' })
  @Permission(PERMISSIONS.APPLICATION_READ)
  async getRecruitmentReport(@Query() filters: QueryRecruitmentReportDto) {
    const data = await this.applicationService.getRecruitmentReport(filters);
    return { success: true, message: 'Recruitment report retrieved successfully', data };
  }

  @Get('report/roles')
  @ApiOperation({ summary: 'Distinct appliedRole values across all applications — powers the Role filter dropdown' })
  @Permission(PERMISSIONS.APPLICATION_READ)
  async getDistinctAppliedRoles() {
    const data = await this.applicationService.getDistinctAppliedRoles();
    return { success: true, message: 'Roles retrieved successfully', data };
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

  @Post(':id/interview-outcome')
  @ApiOperation({
    summary: 'Record the outcome of a candidate\'s interview',
    description:
      'Requires the application to currently be at INTERVIEW_SCHEDULED. Sets outcome, interviewer, and advances status to INTERVIEW_COMPLETED (or NOT_SELECTED on FAIL).',
  })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiResponse({ status: 200, description: 'Interview outcome recorded successfully' })
  @ApiResponse({ status: 400, description: 'Application is not at INTERVIEW_SCHEDULED stage' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing application:manage_status permission' })
  @ApiResponse({ status: 404, description: 'Application or interviewer not found' })
  @Permission(PERMISSIONS.APPLICATION_MANAGE_STATUS)
  async recordInterviewOutcome(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordInterviewOutcomeDto,
    @Req() req: any,
  ) {
    const data = await this.applicationService.recordInterviewOutcome(id, dto, req.user?.id);
    return { success: true, message: 'Interview outcome recorded successfully', data };
  }

  @Post(':id/employment-approval')
  @ApiOperation({
    summary: 'Record Employment Approval for a candidate',
    description:
      'Required gate before an Offer Letter can be generated. Only valid once interviewOutcome is PASS.',
  })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiResponse({ status: 201, description: 'Employment approval recorded successfully' })
  @ApiResponse({ status: 400, description: 'Candidate has not passed interview, or is already approved' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  @Permission(PERMISSIONS.APPLICATION_MANAGE_STATUS)
  async recordEmploymentApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveEmploymentDto,
    @Req() req: any,
  ) {
    const data = await this.applicationService.recordEmploymentApproval(id, dto, req.user.id);
    return { success: true, message: 'Employment approval recorded successfully', data };
  }

  @Post(':id/offer-letter')
  @ApiOperation({
    summary: 'Generate and send an offer letter',
    description: 'Requires employment approval to already be recorded.',
  })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiResponse({ status: 201, description: 'Offer letter generated successfully' })
  @ApiResponse({ status: 400, description: 'Employment approval missing, or offer already generated' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  @Permission(PERMISSIONS.APPLICATION_MANAGE_STATUS)
  async generateOfferLetter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateOfferLetterDto,
    @Req() req: any,
  ) {
    const data = await this.applicationService.generateOfferLetter(id, dto, req.user.id);
    return { success: true, message: 'Offer letter generated successfully', data };
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