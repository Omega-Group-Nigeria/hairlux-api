import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InfluencerService } from './influencer.service';
import { QueryInfluencerRewardsDto } from './dto/query-influencer-rewards.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Influencer – Self-service')
@ApiBearerAuth('JWT-auth')
@Controller('influencer/me')
@UseGuards(JwtAuthGuard)
export class InfluencerController {
  constructor(private readonly influencerService: InfluencerService) {}

  // ─── Profile ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get my influencer profile',
    description:
      "Returns the authenticated user's influencer profile, total earned, and current wallet balance. Returns 403 if the user is not an active influencer.",
  })
  @ApiResponse({
    status: 200,
    description: 'Influencer profile retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Influencer profile retrieved successfully',
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          userId: 'u1b2c3d4-e5f6-7890-abcd-ef1234567890',
          notes: null,
          isActive: true,
          totalEarned: 4500,
          walletBalance: 12000,
          user: {
            id: 'u1b2c3d4',
            firstName: 'Amara',
            lastName: 'Okafor',
            email: 'amara@example.com',
            phone: '+2348012345678',
          },
          _count: { discountCodes: 1, influencerRewards: 5 },
          createdAt: '2026-03-01T10:00:00.000Z',
          updatedAt: '2026-03-01T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'You are not an active influencer' })
  async getMyProfile(@GetUser('id') userId: string) {
    const data = await this.influencerService.getMyProfile(userId);
    return {
      success: true,
      message: 'Influencer profile retrieved successfully',
      data,
    };
  }

  // ─── Codes ────────────────────────────────────────────────────────────────

  @Get('codes')
  @ApiOperation({
    summary: 'Get my discount codes',
    description:
      'Returns all discount codes belonging to the authenticated influencer.',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount codes retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Discount codes retrieved successfully',
        data: [
          {
            id: 'dc-uuid-1',
            code: 'AMARA10',
            name: "Amara's 10% Off",
            percentage: 10,
            isActive: true,
            usedCount: 5,
            maxUses: null,
            startsAt: null,
            expiresAt: null,
            createdAt: '2026-03-01T10:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 403, description: 'You are not an active influencer' })
  async getMyCodes(@GetUser('id') userId: string) {
    const data = await this.influencerService.getMyCodes(userId);
    return {
      success: true,
      message: 'Discount codes retrieved successfully',
      data,
    };
  }

  // ─── Rewards ──────────────────────────────────────────────────────────────

  @Get('rewards')
  @ApiOperation({
    summary: 'Get my reward history',
    description:
      'Returns paginated reward history with total earned, including the discount code usage that triggered each reward.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rewards retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Rewards retrieved successfully',
        data: {
          rewards: [
            {
              id: 'rw-uuid-1',
              rewardAmount: 900,
              status: 'REWARDED',
              createdAt: '2026-03-01T10:00:00.000Z',
              usage: {
                discountAmount: 1200,
                discountCode: {
                  code: 'AMARA10',
                  name: "Amara's 10% Off",
                  percentage: 10,
                },
              },
            },
          ],
          totalEarned: 4500,
          pagination: { page: 1, limit: 20, total: 5, totalPages: 1 },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'You are not an active influencer' })
  async getMyRewards(
    @GetUser('id') userId: string,
    @Query() query: QueryInfluencerRewardsDto,
  ) {
    const data = await this.influencerService.getMyRewards(userId, query);
    return { success: true, message: 'Rewards retrieved successfully', data };
  }
}
