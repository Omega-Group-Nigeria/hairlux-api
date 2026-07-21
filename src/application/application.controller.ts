import { Body, Controller, Post, UseGuards, Req, Get} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { JwtService } from '@nestjs/jwt';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ApplicantAuthGuard } from './guard/applicant-auth.guard';

@ApiTags('applications')
@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService, private readonly jwtService: JwtService) {}

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
  async verifyOtp(@Body() dto: VerifyOtpDto) {
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
}