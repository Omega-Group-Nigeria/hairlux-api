import {
  Controller,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Referrals')
@ApiBearerAuth('JWT-auth')
@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get my referral code and stats',
    description:
      "Returns the authenticated user's unique referral code along with total uses and total earnings.",
  })
  @ApiResponse({
    status: 200,
    description: 'Referral code and stats returned successfully.',
    schema: {
      example: {
        id: 'a1b2c3d4-0000-0000-0000-000000000001',
        userId: 'a1b2c3d4-0000-0000-0000-000000000002',
        code: 'ADE-X7K2',
        totalUses: 3,
        totalEarned: '1500.00',
        createdAt: '2026-02-01T10:00:00.000Z',
        updatedAt: '2026-02-20T14:30:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 404,
    description: 'Referral code not found for this user.',
  })
  async getMyCode(@GetUser('id') userId: string) {
    return this.referralService.getMyCode(userId);
  }

  @Get('me/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get my referral history',
    description:
      'Returns a list of all users referred by the authenticated user, with their names, join dates, and reward status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Referral history returned successfully.',
    schema: {
      example: [
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
            firstName: 'Jane',
            lastName: 'Smith',
            createdAt: '2026-02-10T07:55:00.000Z',
          },
        },
        {
          id: 'ref-uuid-002',
          referrerId: 'user-uuid-001',
          referredId: 'user-uuid-003',
          code: 'ADE-X7K2',
          status: 'PENDING',
          rewardAmount: null,
          createdAt: '2026-02-15T11:00:00.000Z',
          updatedAt: '2026-02-15T11:00:00.000Z',
          referred: {
            firstName: 'Emeka',
            lastName: 'Okafor',
            createdAt: '2026-02-15T10:58:00.000Z',
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyHistory(@GetUser('id') userId: string) {
    return this.referralService.getMyHistory(userId);
  }
}
