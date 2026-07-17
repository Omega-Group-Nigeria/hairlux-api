import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { BeauticianRoleGuard } from './guards/beautician-role.guard';
import { KycVerifiedGuard } from './guards/kyc-verified.guard';
import { BeauticianReadService } from './services/beautician-read.service';
import { BeauticianProfileService } from './services/beautician-profile.service';
import { BeauticianAvailabilityService } from './services/beautician-availability.service';
import { LocationUpdateService } from './tracking/location-update.service';
import { FullyVerifiedGuard } from './guards/fully-verified.guard';
import { UpdateBeauticianProfileDto } from './dto/update-beautician-profile.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { EarningsSummaryService } from './payout/services/earnings-summary.service';
import { PayoutRequestService } from './payout/services/payout-request.service';
import { BeauticianBankAccountService } from './payout/services/beautician-bank-account.service';
import { BeauticianQueryPayoutsDto } from './payout/dto/beautician-query-payouts.dto';
import { RequestPayoutDto } from './payout/dto/request-payout.dto';
import { SetupBankAccountDto } from './payout/dto/setup-bank-account.dto';
import { ResolveBankAccountDto } from './payout/dto/resolve-bank-account.dto';
import { BeauticianWithdrawalGuard } from './guards/beautician-withdrawal.guard';
import { FcmTokenService } from './fcm/fcm-token.service';
import { StreamDeviceSyncService } from '../comms/services/stream-device-sync.service';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';

const imageInterceptor = (field: string) =>
  FileInterceptor(field, {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(
          new BadRequestException('Only image files are allowed.'),
          false,
        );
      }
      cb(null, true);
    },
  });

@ApiTags('Beauticians – Self-service')
@ApiBearerAuth('JWT-auth')
@Controller('beauticians')
@UseGuards(JwtAuthGuard, BeauticianRoleGuard)
export class BeauticianController {
  constructor(
    private readonly beauticianReadService: BeauticianReadService,
    private readonly profileService: BeauticianProfileService,
    private readonly availabilityService: BeauticianAvailabilityService,
    private readonly locationUpdateService: LocationUpdateService,
    private readonly earningsSummaryService: EarningsSummaryService,
    private readonly payoutRequestService: PayoutRequestService,
    private readonly bankAccountService: BeauticianBankAccountService,
    private readonly fcmTokenService: FcmTokenService,
    private readonly streamDeviceSync: StreamDeviceSyncService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my beautician profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getMyProfile(@GetUser('id') userId: string) {
    const data = await this.beauticianReadService.getMyProfile(userId);
    return {
      success: true,
      message: 'Beautician profile retrieved successfully',
      data,
    };
  }

  @Patch('me')
  @UseGuards(KycVerifiedGuard)
  @ApiOperation({ summary: 'Update professional profile (draft or after rejection)' })
  async updateProfile(
    @GetUser('id') userId: string,
    @Body() dto: UpdateBeauticianProfileDto,
  ) {
    const data = await this.profileService.updateProfile(userId, dto);
    return {
      success: true,
      message: 'Profile updated successfully',
      data,
    };
  }

  @Post('me/certifications')
  @UseGuards(KycVerifiedGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(imageInterceptor('image'))
  @ApiOperation({ summary: 'Upload certification document image' })
  async uploadCertification(
    @GetUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    const data = await this.profileService.uploadCertification(userId, file);
    return {
      success: true,
      message: 'Certification uploaded successfully',
      data,
    };
  }

  @Post('profile/submit-for-review')
  @UseGuards(KycVerifiedGuard)
  @ApiOperation({ summary: 'Submit profile for admin review' })
  async submitForReview(@GetUser('id') userId: string) {
    const data = await this.profileService.submitForReview(userId);
    return {
      success: true,
      message: 'Profile submitted for review successfully',
      data,
    };
  }

  @Get('profile/review-status')
  @ApiOperation({ summary: 'Get profile review status' })
  async getReviewStatus(@GetUser('id') userId: string) {
    const data = await this.profileService.getReviewStatus(userId);
    return {
      success: true,
      message: 'Profile review status retrieved successfully',
      data,
    };
  }

  @Patch('availability')
  @UseGuards(FullyVerifiedGuard)
  @ApiOperation({ summary: 'Set availability ONLINE or OFFLINE' })
  async updateAvailability(
    @GetUser('id') userId: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    const data = await this.availabilityService.updateAvailability(
      userId,
      dto.status,
    );
    return {
      success: true,
      message: 'Availability updated successfully',
      data,
    };
  }

  @Get('payout/banks')
  @ApiOperation({
    summary: 'List NIP banks for payout setup',
    description: 'Fetches active Nigerian banks from Paystack (NGN / NUBAN).',
  })
  async listPayoutBanks() {
    const data = await this.bankAccountService.listBanks();
    return {
      success: true,
      message: 'Banks retrieved successfully',
      data,
    };
  }

  @Get('payout/banks/resolve')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Resolve NUBAN account name',
    description:
      'Looks up account holder name via Paystack before saving payout details.',
  })
  async resolvePayoutBankAccount(@Query() query: ResolveBankAccountDto) {
    const data = await this.bankAccountService.resolveBankAccount(query);
    return {
      success: true,
      message: 'Bank account resolved successfully',
      data,
    };
  }

  @Post('payout/bank-account')
  @UseGuards(BeauticianWithdrawalGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set up verified payout bank account',
    description:
      'Resolves NUBAN via Paystack, fuzzy-matches account name to profile, stores recipient_code.',
  })
  async setupBankAccount(
    @GetUser('id') userId: string,
    @Body() dto: SetupBankAccountDto,
  ) {
    const data = await this.bankAccountService.setupBankAccount(userId, dto);
    return {
      success: true,
      message: 'Payout bank account verified and saved successfully',
      data,
    };
  }

  @Get('payout/bank-account')
  @ApiOperation({ summary: 'Get saved payout bank account (masked)' })
  async getBankAccount(@GetUser('id') userId: string) {
    const data = await this.bankAccountService.getBankAccount(userId);
    return {
      success: true,
      message: 'Payout bank account retrieved successfully',
      data,
    };
  }

  @Get('payouts')
  @ApiOperation({ summary: 'List my withdrawal requests' })
  async listMyPayouts(
    @GetUser('id') userId: string,
    @Query() query: BeauticianQueryPayoutsDto,
  ) {
    const data = await this.payoutRequestService.listMyPayouts(userId, query);
    return {
      success: true,
      message: 'Payout requests retrieved successfully',
      data,
    };
  }

  @Post('payout/request')
  @UseGuards(BeauticianWithdrawalGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a wallet withdrawal',
    description:
      'Requires a verified bank account. Manual mode creates a pending request; auto mode initiates Paystack transfer.',
  })
  async requestPayout(
    @GetUser('id') userId: string,
    @Body() dto: RequestPayoutDto,
  ) {
    const data = await this.payoutRequestService.createRequest(userId, dto);
    return {
      success: true,
      message: 'Withdrawal request submitted successfully',
      data,
    };
  }

  @Post('fcm-token')
  @ApiOperation({ summary: 'Register FCM push notification token' })
  async registerFcmToken(
    @GetUser('id') userId: string,
    @Body() dto: RegisterFcmTokenDto,
  ) {
    const data = await this.fcmTokenService.registerToken(
      userId,
      dto.token,
      dto.platform,
    );

    void this.streamDeviceSync.syncUserDevices(userId);

    return {
      success: true,
      message: 'FCM token registered successfully',
      data,
    };
  }

  @Get('earnings/summary')
  @ApiOperation({ summary: 'Get earnings and wallet summary' })
  async getEarningsSummary(@GetUser('id') userId: string) {
    const data = await this.earningsSummaryService.getSummary(userId);
    return {
      success: true,
      message: 'Earnings summary retrieved successfully',
      data,
    };
  }

  @Post('location')
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @ApiOperation({ summary: 'Update current GPS location' })
  async updateLocation(
    @GetUser('id') userId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    const data = await this.locationUpdateService.updateLocation(userId, dto);
    return {
      success: true,
      message: 'Location updated successfully',
      data,
    };
  }
}