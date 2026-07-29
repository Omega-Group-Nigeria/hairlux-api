import { BadRequestException, Body, Controller, Get, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { S3Service } from 'src/storage/s3.service';
import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { RespondToOfferDto } from './dto/respond-to-offer.dto';
import { VerifyApplicantOtpDto } from './dto/verify-otp.dto';
import { ApplicantAuthGuard } from './guard/applicant-auth.guard';

const MAX_CV_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@ApiTags('applications')
@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService,
    private readonly s3Service: S3Service,
    private readonly jwtService: JwtService) { }

  @Post()
  @ApiOperation({
    summary: 'Submit a job application',
    description:
      'Public endpoint used by the careers page application wizard. The NIN should already be verified via POST /nin/verify before this is called.',
  })
  @ApiResponse({ status: 201, description: 'Application submitted successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async submit(@Body() dto: CreateApplicationDto) {
    const data = await this.applicationService.submit(dto);
    return {
      success: true,
      message: 'Application submitted successfully',
      data,
    };
  }

  @Post('request-otp')
  @ApiOperation({ summary: 'Request a fresh login OTP for the applicant dashboard' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    await this.applicationService.requestOtp(dto.applicationCode, dto.email);
    return {
      success: true,
      message: 'If that application code and email match, a login code has been sent.',
    };
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Exchange application code + OTP for a dashboard access token' })
  async verifyOtp(@Body() dto: VerifyApplicantOtpDto) {
    const applicationId = await this.applicationService.verifyOtp(dto.applicationCode, dto.otp);
    const accessToken = await this.jwtService.signAsync(
      { applicationId, purpose: 'applicant' },
      { expiresIn: '2h' },);
    return { success: true, message: 'Verified', data: { accessToken } };
  }

  @Get('me')
  @UseGuards(ApplicantAuthGuard)
  @ApiOperation({ summary: "Get the logged-in applicant's own application" })
  async getMe(@Req() req: any) {
    const data = await this.applicationService.findOne(req.applicationId);
    return { success: true, message: 'Application retrieved successfully', data };
  }


  @Post('offer/respond')
  @UseGuards(ApplicantAuthGuard)
  @ApiOperation({ summary: 'Accept or decline your offer letter' })
  @ApiResponse({ status: 200, description: 'Offer response recorded successfully' })
  @ApiResponse({ status: 400, description: 'Offer already responded to' })
  @ApiResponse({ status: 404, description: 'No offer letter found' })
  async respondToOffer(@Req() req: any, @Body() dto: RespondToOfferDto) {
    const data = await this.applicationService.respondToOffer(req.applicationId, dto);
    return { success: true, message: 'Offer response recorded successfully', data };
  }

  @Post('upload-cv')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload a CV (PDF, max 5MB)',
    description:
      'Public endpoint, called from the careers page wizard before final submission. Returns a cvKey to include as `cvUrl` in the POST /applications payload — not a public link. The file is never made public; admins view it via a short-lived signed URL generated on demand.',
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Missing file, wrong file type, or file too large' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_CV_SIZE_BYTES },
    }),
  )
  async uploadCv(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach a PDF under the "file" field.');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted for CV uploads.');
    }
    // Multer's `limits.fileSize` already rejects oversized uploads before
    // this handler runs, but re-checking here is cheap insurance against
    // any future refactor of the interceptor config.
    if (file.size > MAX_CV_SIZE_BYTES) {
      throw new BadRequestException('CV file must be 5MB or smaller.');
    }

    const key = await this.s3Service.uploadObject(
      file.buffer,
      'applications/cv',
      file.originalname,
      file.mimetype,
    );

    return {
      success: true,
      message: 'CV uploaded successfully',
      data: { cvKey: key },
    };
  }
}