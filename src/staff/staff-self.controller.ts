import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyDocumentService } from './company-document.service';
import { CreateInventoryLogEntryDto } from './dto/create-inventory-log-entry.dto';
import { SubmitAddressVerificationDto } from './dto/submit-address-verification.dto';
import {
  SubmitAddressDto,
  SubmitEmergencyContactDto,
  SubmitGuarantorDto,
  SubmitReferenceDto,
} from './dto/submit-onboarding-info.dto';
import { UpdateDirectiveStatusDto } from './dto/update-directive-status.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { StaffAddressVerificationService } from './staff-address-verification.service';
import { StaffCommsService } from './staff-comms.service';
import { StaffOperationsService } from './staff-operations.service';
import { StaffService } from './staff.service';

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@ApiTags('Staff - Self Service')
@ApiBearerAuth('JWT-auth')
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffSelfController {
  constructor(
    private readonly staffService: StaffService,
    private readonly documentService: CompanyDocumentService,
    private readonly commsService: StaffCommsService,
    private readonly operationsService: StaffOperationsService,
    private readonly addressVerificationService: StaffAddressVerificationService,
  ) { }

  @Get('me')
  @ApiOperation({ summary: "Get the logged-in staff member's own record" })
  @ApiResponse({ status: 200, description: 'Staff record retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  @ApiResponse({ status: 404, description: 'No staff record linked to this account' })
  async getMe(@Req() req: any) {
    const data = await this.staffService.findByUserId(req.user.id);
    return { success: true, message: 'Staff record retrieved successfully', data };
  }

  @Patch('me/profile')
  @ApiOperation({
    summary: 'Edit your own basic contact info (phone)',
    description: 'Applies immediately, no admin review needed — separate from the onboarding submission endpoints, which do require review.',
  })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateMyProfile(@Req() req: any, @Body() dto: UpdateMyProfileDto) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.staffService.updateMyProfile((staff as unknown as { id: string }).id, dto);
    return { success: true, message: 'Profile updated successfully', data };
  }

  @Get('me/onboarding')
  @ApiOperation({ summary: "Get the logged-in staff member's own onboarding checklist" })
  @ApiResponse({ status: 200, description: 'Onboarding checklist retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  @ApiResponse({ status: 404, description: 'No staff record linked to this account' })
  async getMyOnboarding(@Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.staffService.getOnboardingItems(
      (staff as unknown as { id: string }).id,
    );
    return { success: true, message: 'Onboarding checklist retrieved successfully', data };
  }

  @Get('me/id-card.pdf')
  @ApiOperation({ summary: "Download the logged-in staff member's own ID card as a PDF" })
  @ApiResponse({ status: 200, description: 'PDF stream' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  @ApiResponse({ status: 404, description: 'No staff record linked to this account' })
  async downloadMyIdCard(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const staff = await this.staffService.findByUserId(req.user.id);
    const pdfBuffer = await this.staffService.generateIdCardPdf(
      (staff as unknown as { id: string }).id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="my-staff-id.pdf"',
    });
    return new StreamableFile(pdfBuffer);
  }

  @Get('me/documents')
  @ApiOperation({
    summary: "Get the logged-in staff member's document acknowledgment status",
    description:
      'Every currently-active company document (contract, NDA, IT policy, ' +
      'handbook, code of conduct, data protection policy), whether it has ' +
      'been acknowledged, and when.',
  })
  @ApiResponse({ status: 200, description: 'Document status retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async getMyDocuments(@Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.documentService.getStaffDocumentStatus(
      (staff as unknown as { id: string }).id,
    );
    return { success: true, message: 'Document status retrieved successfully', data };
  }

  @Post('me/documents/:documentId/acknowledge')
  @ApiOperation({
    summary: 'Acknowledge a company document ("I have read and accept the terms")',
    description:
      'Records the acknowledgment with timestamp and IP address. Cannot be ' +
      'undone or re-acknowledged once recorded -- this is the audit trail.',
  })
  @ApiResponse({ status: 201, description: 'Document acknowledged successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  @ApiResponse({ status: 404, description: 'Document not found or no longer the active version' })
  @ApiResponse({ status: 409, description: 'This document has already been acknowledged' })
  async acknowledgeDocument(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() req: any,
  ) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip;
    const userAgent = req.headers['user-agent'];

    const data = await this.documentService.acknowledgeDocument(
      (staff as unknown as { id: string }).id,
      documentId,
      ipAddress,
      userAgent,
    );
    return { success: true, message: 'Document acknowledged successfully', data };
  }

  @Get('me/announcements')
  @ApiOperation({ summary: "Get the logged-in staff member's announcements" })
  @ApiResponse({ status: 200, description: 'Announcements retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async getMyAnnouncements(@Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.commsService.getAnnouncementsForStaff(
      (staff as unknown as { id: string }).id,
    );
    return { success: true, message: 'Announcements retrieved successfully', data };
  }

  @Post('me/announcements/:announcementId/read')
  @ApiOperation({ summary: 'Mark an announcement as read (idempotent)' })
  @ApiResponse({ status: 201, description: 'Announcement marked read' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async markAnnouncementRead(
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
    @Req() req: any,
  ) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.commsService.markAnnouncementRead(
      (staff as unknown as { id: string }).id,
      announcementId,
    );
    return { success: true, message: 'Announcement marked read', data };
  }

  @Get('me/directives')
  @ApiOperation({ summary: "Get the logged-in staff member's directives" })
  @ApiResponse({ status: 200, description: 'Directives retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async getMyDirectives(@Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.commsService.getDirectivesForStaff(
      (staff as unknown as { id: string }).id,
    );
    return { success: true, message: 'Directives retrieved successfully', data };
  }

  @Patch('me/directives/:directiveId/status')
  @ApiOperation({
    summary: 'Acknowledge or complete a directive sent to you',
    description: 'Can only move forward: PENDING -> ACKNOWLEDGED -> COMPLETED.',
  })
  @ApiResponse({ status: 200, description: 'Directive status updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role, or this directive was not sent to you' })
  @ApiResponse({ status: 404, description: 'Directive not found' })
  @ApiResponse({ status: 409, description: 'Cannot move a directive backward' })
  async updateDirectiveStatus(
    @Param('directiveId', ParseUUIDPipe) directiveId: string,
    @Body() dto: UpdateDirectiveStatusDto,
    @Req() req: any,
  ) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.commsService.updateDirectiveStatus(
      (staff as unknown as { id: string }).id,
      directiveId,
      dto.status,
    );
    return { success: true, message: 'Directive status updated successfully', data };
  }

  @Post('me/directives/:directiveId/evidence')
  @ApiOperation({
    summary: 'Submit optional proof of completion for a directive sent to you',
    description: 'Typically submitted alongside (or right before) marking the directive COMPLETED. Stored privately, same pattern as passport photo/CV uploads.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Evidence uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Missing file' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - this directive was not sent to you' })
  @ApiResponse({ status: 404, description: 'Directive not found' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  async submitDirectiveEvidence(
    @Param('directiveId', ParseUUIDPipe) directiveId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach a file under the "file" field.');
    }
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.commsService.submitDirectiveEvidence(
      (staff as unknown as { id: string }).id,
      directiveId,
      file,
    );
    return { success: true, message: 'Evidence uploaded successfully', data };
  }

  @Get('me/directives/:directiveId/evidence')
  @ApiOperation({ summary: 'Get a fresh view URL for your own submitted evidence on this directive' })
  @ApiResponse({ status: 200, description: 'View URL retrieved successfully (null if no evidence submitted)' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - this directive was not sent to you' })
  @ApiResponse({ status: 404, description: 'Directive not found' })
  async getMyDirectiveEvidence(@Param('directiveId', ParseUUIDPipe) directiveId: string, @Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const viewUrl = await this.commsService.getDirectiveEvidenceViewUrl(
      directiveId,
      (staff as unknown as { id: string }).id,
    );
    return { success: true, message: 'View URL retrieved successfully', data: { viewUrl } };
  }

  @Post('me/inventory')
  @ApiOperation({
    summary: 'Log a product received or sold at your branch',
    description: 'Always logged against your own assigned branch.',
  })
  @ApiResponse({ status: 201, description: 'Inventory entry logged successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async logInventoryEntry(@Body() dto: CreateInventoryLogEntryDto, @Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.operationsService.logInventoryEntry(
      (staff as unknown as { id: string }).id,
      dto,
    );
    return { success: true, message: 'Inventory entry logged successfully', data };
  }

  @Get('me/inventory/dashboard')
  @ApiOperation({ summary: 'Running stock totals for your own branch' })
  @ApiResponse({ status: 200, description: 'Inventory dashboard retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async getMyInventoryDashboard(@Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.operationsService.getMyInventoryDashboard(
      (staff as unknown as { id: string }).id,
    );
    return { success: true, message: 'Inventory dashboard retrieved successfully', data };
  }

  @Get('me/inventory/entries')
  @ApiOperation({ summary: 'Recent inventory log entries for your own branch' })
  @ApiResponse({ status: 200, description: 'Inventory entries retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async getMyInventoryEntries(@Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.operationsService.getMyInventoryEntries(
      (staff as unknown as { id: string }).id,
    );
    return { success: true, message: 'Inventory entries retrieved successfully', data };
  }

  @Patch('me/onboarding/guarantor')
  @ApiOperation({
    summary: 'Submit your guarantor information',
    description: 'Moves the Guarantor Verification checklist item to SUBMITTED -- an admin still reviews and approves it.',
  })
  @ApiResponse({ status: 200, description: 'Guarantor information submitted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async submitGuarantor(@Body() dto: SubmitGuarantorDto, @Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.staffService.submitGuarantorInfo((staff as unknown as { id: string }).id, dto);
    return { success: true, message: 'Guarantor information submitted successfully', data };
  }

  @Patch('me/onboarding/emergency-contact')
  @ApiOperation({
    summary: 'Submit your emergency contact information',
    description: 'Moves the Emergency Contact checklist item to SUBMITTED -- an admin still reviews and approves it.',
  })
  @ApiResponse({ status: 200, description: 'Emergency contact submitted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async submitEmergencyContact(@Body() dto: SubmitEmergencyContactDto, @Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.staffService.submitEmergencyContact((staff as unknown as { id: string }).id, dto);
    return { success: true, message: 'Emergency contact submitted successfully', data };
  }

  @Patch('me/onboarding/address')
  @ApiOperation({
    summary: 'Submit your residential address',
    description: 'Moves the Address Verification checklist item to SUBMITTED -- an admin still reviews and approves it.',
  })
  @ApiResponse({ status: 200, description: 'Address submitted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async submitAddress(@Body() dto: SubmitAddressDto, @Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.staffService.submitAddress((staff as unknown as { id: string }).id, dto);
    return { success: true, message: 'Address submitted successfully', data };
  }

  @Patch('me/onboarding/reference')
  @ApiOperation({
    summary: 'Submit a work/personal reference',
    description: 'Moves the Reference Check checklist item to SUBMITTED -- an admin still contacts the reference and approves it.',
  })
  @ApiResponse({ status: 200, description: 'Reference submitted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async submitReference(@Body() dto: SubmitReferenceDto, @Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.staffService.submitReference((staff as unknown as { id: string }).id, dto);
    return { success: true, message: 'Reference submitted successfully', data };
  }

  @Post('me/onboarding/passport-photo')
  @ApiOperation({
    summary: 'Upload your passport photo',
    description: 'Moves the Passport Photo checklist item to SUBMITTED -- an admin still reviews and approves it. Stored privately, same pattern as CV uploads.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Passport photo uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Missing file, wrong file type, or file too large' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  async submitPassportPhoto(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach an image under the "file" field.');
    }
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG or PNG images are accepted.');
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      throw new BadRequestException('Image must be 5MB or smaller.');
    }
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.staffService.submitPassportPhoto((staff as unknown as { id: string }).id, file);
    return { success: true, message: 'Passport photo uploaded successfully', data };
  }

  @Get('me/onboarding/passport-photo')
  @ApiOperation({ summary: 'Get a fresh view URL for your own uploaded passport photo' })
  @ApiResponse({ status: 200, description: 'View URL retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  async getMyPassportPhoto(@Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const viewUrl = await this.staffService.getPassportPhotoViewUrl((staff as unknown as { id: string }).id);
    return { success: true, message: 'View URL retrieved successfully', data: { viewUrl } };
  }

  @Get('me/address-verification')
  @ApiOperation({ summary: 'Get your own address verification status -- null if never requested' })
  @ApiResponse({ status: 200, description: 'Retrieved successfully' })
  async getMyAddressVerification(@Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.addressVerificationService.getStatus((staff as unknown as { id: string }).id);
    return { success: true, message: 'Retrieved successfully', data };
  }

  @Post('me/address-verification/submit')
  @ApiOperation({
    summary: 'Submit your physical address for QoreID verification',
    description: 'Only allowed after an admin has requested it. Physical verification (a real field-agent visit) takes 24-48h -- this call only ever acknowledges submission, never the final result.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Submitted -- verification in progress' })
  @ApiResponse({ status: 400, description: 'Not requested yet, already in progress, or already verified' })
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'photo1', maxCount: 1 },
    { name: 'photo2', maxCount: 1 },
    { name: 'photo3', maxCount: 1 },
  ], { limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  async submitAddressVerification(
    @UploadedFiles() files: { photo1?: Express.Multer.File[]; photo2?: Express.Multer.File[]; photo3?: Express.Multer.File[] },
    @Body() dto: SubmitAddressVerificationDto,
    @Req() req: any,
  ) {
    const staff = await this.staffService.findByUserId(req.user.id);
    const data = await this.addressVerificationService.submit((staff as unknown as { id: string }).id, dto, files || {});
    return { success: true, message: 'Address verification submitted -- results typically take 24-48 hours', data };
  }

  @Get('me/compensation')
  @ApiOperation({
    summary: "Get the logged-in staff member's base salary/allowances",
    description: 'Sourced from their original Offer Letter. Returns null if no offer letter exists (e.g. legacy/seeded staff not hired through Recruitment).',
  })
  @ApiResponse({ status: 200, description: 'Compensation data retrieved successfully' })
  async getMyCompensation(@Req() req: any) {
    const staff = await this.staffService.findByUserId(req.user.id) as unknown as { id: string };
    const data = await this.staffService.getCompensation(staff.id);
    return { success: true, message: 'Compensation retrieved successfully', data };
  }
}