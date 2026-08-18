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
  Req,
  Res,
  StreamableFile,
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
import type { Response } from 'express';
import { Permission } from '../auth/decorators/permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import { CompanyDocumentService } from './company-document.service';
import { AddEmploymentHistoryDto } from './dto/add-employment-history.dto';
import { ArchiveStaffDto } from './dto/archive-staff.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateStaffLocationDto } from './dto/create-staff-location.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { QueryStaffLocationsDto } from './dto/query-staff-locations.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { QueryUpcomingBirthdaysDto } from './dto/query-upcoming-birthdays.dto';
import { TransferBranchDto } from './dto/transfer-branch.dto';
import { StaffAddressVerificationService } from './staff-address-verification.service';
import { UpdateEmploymentHistoryDto } from './dto/update-employment-history.dto';
import { UpdateOnboardingItemDto } from './dto/update-onboarding-item.dto';
import { UpdateStaffLocationDto } from './dto/update-staff-location.dto';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffCommsService } from './staff-comms.service';
import { StaffService } from './staff.service';

@ApiTags('Admin - Staff')
@ApiBearerAuth('JWT-auth')
@Controller('admin/staff')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminStaffController {
  constructor(private readonly staffService: StaffService,
    private readonly documentService: CompanyDocumentService,
    private readonly commsService: StaffCommsService,
    private readonly addressVerificationService: StaffAddressVerificationService,

  ) { }

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

  @Get('locations/suggest-code')
  @ApiOperation({
    summary: 'Suggest a branch code from a proposed branch name',
    description:
      'Returns a suggested 2-3 letter code (e.g. "Lekki Branch" -> "LEK") for the ' +
      'admin UI to pre-fill on the create-branch form. This does NOT create or ' +
      'reserve anything — the admin must confirm or edit the code before submitting ' +
      'POST /admin/staff/locations, since the code is printed on staff ID cards and ' +
      'is effectively permanent once staff are hired against it.',
  })
  @ApiResponse({ status: 200, description: 'Suggested code returned' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:manage_locations permission',
  })
  @Permission(PERMISSIONS.STAFF_MANAGE_LOCATIONS)
  async suggestLocationCode(@Query('name') name: string) {
    const data = await this.staffService.previewBranchCode(name ?? '');
    return {
      success: true,
      message: 'Branch code suggestion generated successfully',
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
    description: 'Updates location name, address, and activation state.',
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

  @Get('onboarding-summary')
  @Permission(PERMISSIONS.STAFF_READ)
  async getOnboardingSummary() {
    const data = await this.staffService.getOnboardingSummary();
    return { success: true, message: 'Onboarding summary retrieved successfully', data };
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
    @Req() req: any,

  ) {
    const data = await this.staffService.updateStatus(id, dto, req.user.id);
    return {
      success: true,
      message: 'Staff status updated successfully',
      data,
    };
  }

  @Patch(':id/transfer-branch')
  @ApiOperation({
    summary: 'Transfer staff to a different branch',
    description:
      'Closes the current employment-history row and opens a new one at the destination branch, and issues a new branch-coded staff ID — the old one is retired and can never be reissued to anyone else.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({ status: 200, description: 'Staff transferred successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Staff record or destination branch not found' })
  @Permission(PERMISSIONS.STAFF_MANAGE_STATUS)
  async transferBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferBranchDto,
    @Req() req: any,
  ) {
    const data = await this.staffService.transferBranch(id, dto, req.user.id);
    return {
      success: true,
      message: 'Staff transferred to the new branch successfully',
      data,
    };
  }

  @Post(':id/address-verification/request')
  @ApiOperation({
    summary: "Request the staff member complete Physical Address Verification (QoreID)",
    description: 'Notifies nothing on its own -- the staff member sees the pending request on their Staff Portal and fills in the form there. Physical verification then takes 24-48h via QoreID\'s field agent network.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({ status: 201, description: 'Address verification requested' })
  @Permission(PERMISSIONS.STAFF_MANAGE_STATUS)
  async requestAddressVerification(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const data = await this.addressVerificationService.requestVerification(id, req.user.id);
    return { success: true, message: 'Address verification requested', data };
  }

  @Get(':id/address-verification')
  @ApiOperation({ summary: 'Get the current address verification status/details for a staff member' })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @Permission(PERMISSIONS.STAFF_READ)
  async getAddressVerification(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.addressVerificationService.getStatus(id);
    return { success: true, message: 'Retrieved successfully', data };
  }

  @Get(':id/code-history')
  @ApiOperation({ summary: "Get a staff member's full staff-code history (every branch transfer)" })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @Permission(PERMISSIONS.STAFF_READ)
  async getCodeHistory(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.staffService.getCodeHistory(id);
    return { success: true, message: 'Staff code history retrieved successfully', data };
  }

  @Get(':id/role-assignment')
  @ApiOperation({ summary: "Get a staff member's current role assignment — permission set and whether it includes admin portal login" })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @Permission(PERMISSIONS.STAFF_READ)
  async getRoleAssignment(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.staffService.getRoleAssignment(id);
    return { success: true, message: 'Role assignment retrieved successfully', data };
  }

  @Patch(':id/role-assignment')
  @ApiOperation({
    summary: 'Assign a permission role to a staff member',
    description: 'Sets their AdminRole (permission set), applied in both portals wherever permissions are checked. Admin dashboard login is a separate, explicit flag on this same call — a role can be assigned purely for staff-portal elevation with no admin-portal access at all.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @Roles(UserRole.SUPER_ADMIN)
  async assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
    @Req() req: any,
  ) {
    const data = await this.staffService.assignRole(id, dto.adminRoleId, dto.grantPortalLogin, req.user.id, dto.mode ?? 'primary'); return { success: true, message: 'Role assigned successfully', data };
  }

  @Delete(':id/role-assignment')
  @ApiOperation({ summary: 'Remove a staff member\'s role assignment — clears their permission set and any admin portal login' })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @Roles(UserRole.SUPER_ADMIN)
  async removeRole(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.staffService.removeRole(id);
    return { success: true, message: 'Role assignment removed successfully', data };
  }


  @Get(':id/disciplinary-actions')
  @ApiOperation({ summary: "Get a staff member's disciplinary action history" })
  @ApiParam({ name: 'id' })
  @Permission(PERMISSIONS.STAFF_READ)
  async getDisciplinaryActions(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.staffService.getDisciplinaryActions(id);
    return { success: true, message: 'Disciplinary actions retrieved successfully', data };
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

  @Get(':id/passport-photo')
  @ApiOperation({ summary: "Get a fresh view URL for a staff member's uploaded passport photo" })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({ status: 200, description: 'View URL retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing staff:read permission' })
  @Permission(PERMISSIONS.STAFF_READ)
  async getPassportPhoto(@Param('id', ParseUUIDPipe) id: string) {
    const viewUrl = await this.staffService.getPassportPhotoViewUrl(id);
    return { success: true, message: 'View URL retrieved successfully', data: { viewUrl } };
  }

  @Get(':id/onboarding')
  @Permission(PERMISSIONS.STAFF_READ)
  async getOnboardingItems(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.staffService.getOnboardingItems(id);
    return { success: true, message: 'Onboarding checklist retrieved successfully', data };
  }

  @Patch(':id/onboarding/:itemId')
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async updateOnboardingItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOnboardingItemDto,
    @Req() req: any,
  ) {
    const data = await this.staffService.updateOnboardingItem(id, itemId, dto, req.user?.id);
    return { success: true, message: 'Onboarding item updated successfully', data };
  }

  @Get(':id/documents')
  @Permission(PERMISSIONS.STAFF_READ)
  async getStaffDocumentStatus(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.documentService.getStaffDocumentStatus(id);
    return { success: true, message: 'Document status retrieved successfully', data };
  }

  @Get(':id/directives')
  @Permission(PERMISSIONS.STAFF_READ)
  async getStaffDirectives(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.commsService.getDirectivesForStaff(id);
    return { success: true, message: 'Directives retrieved successfully', data };
  }

  @Get(':id/id-card.pdf')
  @Permission(PERMISSIONS.STAFF_READ)
  async downloadIdCard(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pdfBuffer = await this.staffService.generateIdCardPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="staff-id-${id}.pdf"`,
    });
    return new StreamableFile(pdfBuffer);
  }

  @Get('legacy-account-backfill/preview')
  @ApiOperation({
    summary: 'Preview legacy staff account backfill (dry run only)',
    description:
      'Read-only. Shows what would happen for every staff record that has no ' +
      'linked user account — resolved login email (existing Staff.email, or a ' +
      'generated firstname.lastname@hairlux.com.ng), and whether a matching User ' +
      'already exists (link) or would be created fresh. Creates nothing. Use this ' +
      'to review the list before manually triggering each one via POST ' +
      '/admin/staff/:id/link-user-account, after giving that staff member a ' +
      'heads-up in person — this is intentionally not an auto-fire-all-at-once flow.',
  })
  @ApiResponse({ status: 200, description: 'Backfill plan generated successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:read permission',
  })
  @Permission(PERMISSIONS.STAFF_READ)
  async previewLegacyAccountBackfill() {
    const data = await this.staffService.previewLegacyAccountBackfill();
    return {
      success: true,
      message: 'Legacy account backfill plan generated successfully',
      data,
    };
  }

  @Post(':id/link-user-account')
  @ApiOperation({
    summary: 'Create or link a user account for one legacy staff member',
    description:
      'Admin-triggered, one staff member at a time — only call this after the ' +
      'admin has told this specific person in person that their dashboard access ' +
      'is coming, since it sends the password-setup email immediately. Mirrors ' +
      'the same resolution logic as converting a job applicant to staff: an ' +
      'existing User account found by email gets STAFF granted alongside ' +
      'whatever they already are; no match creates a fresh account with a ' +
      'random, never-transmitted password, with real credentials set via the ' +
      'password-setup link.',
  })
  @ApiParam({ name: 'id', description: 'Staff record ID' })
  @ApiResponse({ status: 200, description: 'User account linked successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing staff:update permission',
  })
  @ApiResponse({ status: 404, description: 'Staff record not found' })
  @ApiResponse({
    status: 409,
    description:
      'Staff member already has a linked account, or the resolved email is ' +
      'already linked to a different staff member',
  })
  @Permission(PERMISSIONS.STAFF_UPDATE)
  async linkUserAccountForStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    const data = await this.staffService.linkUserAccountForStaff(id, req.user?.id);
    return {
      success: true,
      message: 'Staff account linked successfully — password-setup email sent',
      data,
    };
  }
}