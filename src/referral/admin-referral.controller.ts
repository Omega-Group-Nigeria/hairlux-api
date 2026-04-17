import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { QueryReferralsDto } from './dto/query-referrals.dto';
import { CreateReferralCampaignCodeDto } from './dto/create-referral-campaign-code.dto';
import { UpdateReferralCampaignCodeDto } from './dto/update-referral-campaign-code.dto';
import { QueryReferralCampaignCodesDto } from './dto/query-referral-campaign-codes.dto';

@ApiTags('Admin - Referrals')
@ApiBearerAuth('JWT-auth')
@Controller('admin/referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('campaign-codes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create referral campaign code',
    description:
      'Creates an admin-managed signup referral campaign code that credits a wallet bonus to eligible new users.',
  })
  @ApiBody({ type: CreateReferralCampaignCodeDto })
  @ApiResponse({
    status: 201,
    description: 'Campaign code created successfully.',
    schema: {
      example: {
        id: 'campaign-uuid-001',
        code: 'LAUNCH100',
        name: 'Launch Bonus Campaign',
        description: 'Signup bonus for first 100 users',
        signupBonusAmount: '1000.00',
        isActive: true,
        startsAt: '2026-04-20T00:00:00.000Z',
        expiresAt: '2026-05-20T23:59:59.999Z',
        maxUses: 100,
        usedCount: 0,
        createdAt: '2026-04-20T08:00:00.000Z',
        updatedAt: '2026-04-20T08:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate code.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  async createCampaignCode(@Body() dto: CreateReferralCampaignCodeDto) {
    return this.referralService.createCampaignCode(dto);
  }

  @Get('campaign-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List referral campaign codes',
    description:
      'Returns paginated referral campaign codes with usage counts for admin monitoring.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'isActive',
    required: false,
    enum: ['true', 'false'],
    example: 'false',
  })
  @ApiQuery({ name: 'code', required: false, example: 'LAUNCH' })
  @ApiResponse({
    status: 200,
    description: 'Campaign codes returned successfully.',
    schema: {
      example: {
        data: [
          {
            id: 'campaign-uuid-001',
            code: 'LAUNCH100',
            name: 'Launch Bonus Campaign',
            description: 'Signup bonus for first 100 users',
            signupBonusAmount: '1000.00',
            isActive: true,
            startsAt: '2026-04-20T00:00:00.000Z',
            expiresAt: '2026-05-20T23:59:59.999Z',
            maxUses: 100,
            usedCount: 45,
            createdAt: '2026-04-20T08:00:00.000Z',
            updatedAt: '2026-04-21T12:30:00.000Z',
            _count: {
              usages: 45,
            },
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  async getCampaignCodes(@Query() query: QueryReferralCampaignCodesDto) {
    return this.referralService.getCampaignCodes(query);
  }

  @Get('campaign-codes/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one referral campaign code',
    description: 'Returns details and usage count for a specific campaign code.',
  })
  @ApiParam({
    name: 'id',
    description: 'Campaign code UUID',
    example: 'campaign-uuid-001',
  })
  @ApiResponse({
    status: 200,
    description: 'Campaign code returned successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  @ApiResponse({ status: 404, description: 'Campaign code not found.' })
  async getCampaignCodeById(@Param('id') id: string) {
    return this.referralService.getCampaignCodeById(id);
  }

  @Patch('campaign-codes/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update referral campaign code',
    description:
      'Updates campaign code metadata, bonus amount, validity window, limits, and active state.',
  })
  @ApiParam({
    name: 'id',
    description: 'Campaign code UUID',
    example: 'campaign-uuid-001',
  })
  @ApiBody({ type: UpdateReferralCampaignCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Campaign code updated successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid update payload.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  @ApiResponse({ status: 404, description: 'Campaign code not found.' })
  async updateCampaignCode(
    @Param('id') id: string,
    @Body() dto: UpdateReferralCampaignCodeDto,
  ) {
    return this.referralService.updateCampaignCode(id, dto);
  }

  @Delete('campaign-codes/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete or deactivate campaign code',
    description:
      'Deletes campaign code when usedCount is 0. If usedCount is greater than 0, the code is deactivated instead.',
  })
  @ApiParam({
    name: 'id',
    description: 'Campaign code UUID',
    example: 'campaign-uuid-001',
  })
  @ApiResponse({
    status: 200,
    description: 'Campaign code deleted or deactivated successfully.',
    schema: {
      example: {
        action: 'DEACTIVATED',
        message:
          'Campaign code has usage history and was deactivated instead of deleted',
        data: {
          id: 'campaign-uuid-001',
          code: 'LAUNCH100',
          isActive: false,
          usedCount: 12,
          updatedAt: '2026-04-17T10:30:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  @ApiResponse({ status: 404, description: 'Campaign code not found.' })
  async deleteCampaignCode(@Param('id') id: string) {
    return this.referralService.deleteCampaignCode(id);
  }

  @Get('settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get referral programme settings',
    description:
      'Returns the current referral reward configuration. Returns null if not yet configured.',
  })
  @ApiResponse({
    status: 200,
    description: 'Settings returned successfully.',
    schema: {
      example: {
        id: 'settings-uuid-001',
        isActive: true,
        rewardType: 'FIXED',
        rewardValue: '500.00',
        minDepositAmount: '1000.00',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  async getSettings() {
    return this.referralService.getSettings();
  }

  @Put('settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create or update referral programme settings',
    description:
      'All fields are optional — only provided fields are updated. ' +
      'When rewardType is PERCENTAGE, rewardValue must be between 0.01 and 100.',
  })
  @ApiBody({ type: UpdateReferralSettingsDto })
  @ApiResponse({
    status: 200,
    description: 'Settings saved successfully.',
    schema: {
      example: {
        id: 'settings-uuid-001',
        isActive: true,
        rewardType: 'PERCENTAGE',
        rewardValue: '10.00',
        minDepositAmount: '500.00',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-26T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (e.g. PERCENTAGE rewardValue > 100).',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  async updateSettings(@Body() dto: UpdateReferralSettingsDto) {
    return this.referralService.upsertSettings(dto);
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get overall referral programme statistics',
    description:
      'Returns aggregate counts and total naira value rewarded across all referrals.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics returned successfully.',
    schema: {
      example: {
        total: 120,
        rewarded: 95,
        failed: 3,
        pending: 22,
        totalRewarded: 47500,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  async getStats() {
    return this.referralService.getStats();
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all referrals',
    description:
      'Paginated list of referrals with optional filtering by status and date range.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'REWARDED', 'FAILED'],
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    example: '2026-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    example: '2026-12-31T23:59:59.999Z',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated referral list returned successfully.',
    schema: {
      example: {
        data: [
          {
            id: 'ref-uuid-001',
            referrerId: 'user-uuid-001',
            referredId: 'user-uuid-002',
            code: 'ADE-X7K2',
            status: 'REWARDED',
            rewardAmount: '500.00',
            createdAt: '2026-02-10T08:00:00.000Z',
            updatedAt: '2026-02-10T09:00:00.000Z',
            referrer: {
              id: 'user-uuid-001',
              firstName: 'Ade',
              lastName: 'Bello',
              email: 'ade@example.com',
            },
            referred: {
              id: 'user-uuid-002',
              firstName: 'Jane',
              lastName: 'Smith',
              email: 'jane@example.com',
              createdAt: '2026-02-10T07:55:00.000Z',
            },
          },
        ],
        meta: {
          total: 120,
          page: 1,
          limit: 20,
          totalPages: 6,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  async getAllReferrals(@Query() query: QueryReferralsDto) {
    return this.referralService.getAllReferrals(query);
  }

  @Get(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get referral details for a specific user',
    description:
      "Returns the user's referral code stats, the list of users they referred, and the referral record of who referred them (if any).",
  })
  @ApiParam({
    name: 'userId',
    description: 'UUID of the user to look up',
    example: 'user-uuid-001',
  })
  @ApiResponse({
    status: 200,
    description: 'User referral details returned successfully.',
    schema: {
      example: {
        referralCode: {
          id: 'rc-uuid-001',
          userId: 'user-uuid-001',
          code: 'ADE-X7K2',
          totalUses: 3,
          totalEarned: '1500.00',
          createdAt: '2026-02-01T10:00:00.000Z',
          updatedAt: '2026-02-20T14:30:00.000Z',
        },
        referrals: [
          {
            id: 'ref-uuid-001',
            referrerId: 'user-uuid-001',
            referredId: 'user-uuid-002',
            code: 'ADE-X7K2',
            status: 'REWARDED',
            rewardAmount: '500.00',
            createdAt: '2026-02-10T08:00:00.000Z',
            updatedAt: '2026-02-10T09:00:00.000Z',
            referred: {
              id: 'user-uuid-002',
              firstName: 'Jane',
              lastName: 'Smith',
              email: 'jane@example.com',
              createdAt: '2026-02-10T07:55:00.000Z',
            },
          },
        ],
        referredBy: {
          id: 'ref-uuid-000',
          referrerId: 'user-uuid-000',
          referredId: 'user-uuid-001',
          code: 'BOS-A3M9',
          status: 'REWARDED',
          rewardAmount: '500.00',
          createdAt: '2026-01-15T09:00:00.000Z',
          updatedAt: '2026-01-15T10:00:00.000Z',
          referrer: {
            id: 'user-uuid-000',
            firstName: 'Bosun',
            lastName: 'Adewale',
            email: 'bosun@example.com',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin/super-admin only.',
  })
  async getReferralsByUser(@Param('userId') userId: string) {
    return this.referralService.getReferralsByUser(userId);
  }
}
