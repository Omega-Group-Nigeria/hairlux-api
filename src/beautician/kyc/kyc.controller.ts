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
import { KycVideoMultipartService } from './services/kyc-video-multipart.service';
import { InitiateKycDto } from './dto/initiate-kyc.dto';
import { RequestKycVideoUploadDto } from './dto/request-kyc-video-upload.dto';
import { ConfirmKycVideoUploadDto } from './dto/confirm-kyc-video-upload.dto';
import { ConfirmKycVideoMultipartDto } from './dto/confirm-kyc-video-multipart.dto';
import { RefreshKycVideoUploadDto } from './dto/refresh-kyc-video-upload.dto';

@ApiTags('Beauticians – KYC')
@ApiBearerAuth('JWT-auth')
@Controller('beauticians/kyc')
@UseGuards(JwtAuthGuard, BeauticianRoleGuard)
export class KycController {
  constructor(
    private readonly qoreidSessionService: QoreidSessionService,
    private readonly kycStatusService: KycStatusService,
    private readonly kycVideoService: KycVideoService,
    private readonly kycVideoMultipartService: KycVideoMultipartService,
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
    summary: 'Request resumable multipart upload for KYC intro video',
    description:
      'Step 3 of onboarding (after QoreID + profile submission). Profile must be AWAITING_VIDEO. Returns uploadId + presigned part URLs (5 MB parts, R2 minimum) valid ~20 minutes. Client uploads parts with stall detection, refreshes URLs when <2min left, then confirms with etags. Falls back to single PUT for small files. Max 100 MB; video/mp4, video/quicktime, or video/webm.',
  })
  @ApiResponse({ status: 201, description: 'Multipart upload session created' })
  @ApiResponse({
    status: 400,
    description: 'Profile not ready for video (must submit profile first)',
  })
  async requestVideoUpload(
    @GetUser('id') userId: string,
    @Body() dto: RequestKycVideoUploadDto,
  ) {
    const data = await this.kycVideoMultipartService.createSession(
      userId,
      dto.contentType as never,
      dto.fileSizeBytes,
    );
    return {
      success: true,
      message: 'Multipart upload session created successfully',
      data: {
        ...data,
        instructions:
          'Upload each part via PUT to partUrls[].url. Retry per part 3x with exponential backoff. If bytesSent stalls 15s, retry chunk from 0. When expiresAt <2min, call refresh-upload. Store uploadId/partUrls/etags in AsyncStorage for resume across background/foreground. Then call confirm-multipart with etags.',
      },
    };
  }

  @Post('video/refresh-upload')
  @UseGuards(KycVerifiedGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Refresh presigned part URLs for an active multipart upload',
    description: 'Re-issues part URLs when expiry <2 minutes. Requires uploadId from request-upload.',
  })
  @ApiResponse({ status: 201, description: 'Refreshed part URLs' })
  async refreshVideoUpload(
    @GetUser('id') userId: string,
    @Body() dto: RefreshKycVideoUploadDto,
  ) {
    const data = await this.kycVideoMultipartService.refreshPartUrls(userId, dto.uploadId);
    return {
      success: true,
      message: 'Part URLs refreshed successfully',
      data,
    };
  }

  @Post('video/confirm-upload')
  @UseGuards(KycVerifiedGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Confirm KYC video upload and place profile under review (legacy single-PUT)',
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

  @Post('video/confirm-multipart')
  @UseGuards(KycVerifiedGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Complete resumable multipart upload and place profile under review',
    description:
      'After uploading all parts, server completes R2 multipart with etags, verifies object, and sets profileStatus to PENDING_REVIEW. Idempotent - same fileKey/uploadId returns success if already PENDING_REVIEW.',
  })
  @ApiResponse({ status: 201, description: 'Multipart video confirmed; under review' })
  async confirmMultipartUpload(
    @GetUser('id') userId: string,
    @Body() dto: ConfirmKycVideoMultipartDto,
  ) {
    const data = await this.kycVideoMultipartService.completeMultipart(
      userId,
      dto.uploadId,
      dto.fileKey,
      dto.contentType as never,
      dto.parts,
      dto.fileSizeBytes,
    );
    return {
      success: true,
      message: 'Video submitted successfully. Your profile and video are now under admin review.',
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