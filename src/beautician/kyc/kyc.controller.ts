import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { BeauticianRoleGuard } from '../guards/beautician-role.guard';
import { KycVerifiedGuard } from '../guards/kyc-verified.guard';
import { QoreidSessionService } from './services/qoreid-session.service';
import { KycStatusService } from './services/kyc-status.service';
import { KycVideoService } from './services/kyc-video.service';
import { InitiateKycDto } from './dto/initiate-kyc.dto';
import { RequestKycVideoUploadDto } from './dto/request-kyc-video-upload.dto';
import { ConfirmKycVideoUploadDto } from './dto/confirm-kyc-video-upload.dto';

@ApiTags('Beauticians – KYC')
@ApiBearerAuth('JWT-auth')
@Controller('beauticians/kyc')
@UseGuards(JwtAuthGuard, BeauticianRoleGuard)
export class KycController {
  constructor(
    private readonly qoreidSessionService: QoreidSessionService,
    private readonly kycStatusService: KycStatusService,
    private readonly kycVideoService: KycVideoService,
  ) {}

  @Post('initiate')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: 'Create QoreID workflow session',
    description:
      'Requires JWT (BEAUTICIAN). Stores a validated HTTPS portfolio URL on the beautician profile, then creates a QoreID session. Rate-limited to 3 requests/minute.',
  })
  @ApiResponse({ status: 201, description: 'Session created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid portfolio URL or KYC not allowed in current status',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – not a beautician' })
  async initiate(
    @GetUser('id') userId: string,
    @Body() dto: InitiateKycDto,
  ) {
    const data = await this.qoreidSessionService.initiateSession(
      userId,
      dto.portfolioUrl,
    );
    return {
      success: true,
      message: 'KYC session initiated successfully',
      data,
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get current KYC status' })
  @ApiResponse({ status: 200, description: 'KYC status retrieved' })
  async getStatus(@GetUser('id') userId: string) {
    const data = await this.kycStatusService.getStatus(userId);
    return {
      success: true,
      message: 'KYC status retrieved successfully',
      data,
    };
  }

  @Post('video/request-upload')
  @UseGuards(KycVerifiedGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Request presigned URL to upload KYC intro video',
    description:
      'Step 3 of onboarding (after QoreID + profile submission). Profile must be AWAITING_VIDEO. Returns a presigned PUT URL valid ~10 minutes. Max 15 MB; video/mp4, video/quicktime, or video/webm.',
  })
  @ApiResponse({ status: 201, description: 'Presigned upload URL created' })
  @ApiResponse({
    status: 400,
    description: 'Profile not ready for video (must submit profile first)',
  })
  async requestVideoUpload(
    @GetUser('id') userId: string,
    @Body() dto: RequestKycVideoUploadDto,
  ) {
    const data = await this.kycVideoService.requestUpload(userId, dto);
    return {
      success: true,
      message: 'Video upload URL created successfully',
      data,
    };
  }

  @Post('video/confirm-upload')
  @UseGuards(KycVerifiedGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Confirm KYC video upload and place profile under review',
    description:
      'Call after the client finishes PUT to R2. Verifies the object exists, stores the file key, and sets profileStatus to PENDING_REVIEW.',
  })
  @ApiResponse({ status: 201, description: 'Video confirmed; under review' })
  async confirmVideoUpload(
    @GetUser('id') userId: string,
    @Body() dto: ConfirmKycVideoUploadDto,
  ) {
    const data = await this.kycVideoService.confirmUpload(userId, dto);
    return {
      success: true,
      message: 'Video submitted successfully',
      data,
    };
  }

  @Get('video')
  @ApiOperation({
    summary: 'Get presigned URL to play submitted KYC video',
    description:
      'Returns a temporary GET URL for the beautician to replay their submitted intro video.',
  })
  @ApiResponse({ status: 200, description: 'Presigned download URL' })
  @ApiResponse({ status: 404, description: 'No video submitted' })
  async getVideo(@GetUser('id') userId: string) {
    const data = await this.kycVideoService.getVideoPlaybackUrl(userId);
    return {
      success: true,
      message: 'KYC video URL retrieved successfully',
      data,
    };
  }
}