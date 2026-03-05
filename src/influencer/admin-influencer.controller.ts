import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { InfluencerService } from './influencer.service';
import { UpdateInfluencerDto } from './dto/update-influencer.dto';
import { QueryInfluencersDto } from './dto/query-influencers.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin – Influencers')
@ApiBearerAuth('JWT-auth')
@Controller('admin/influencers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminInfluencerController {
  constructor(private readonly influencerService: InfluencerService) {}

  // ─── List ─────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List all influencers',
    description:
      'Returns paginated influencers with linked user info. Search by name, email, or phone.',
  })
  @ApiResponse({
    status: 200,
    description: 'Influencers retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Influencers retrieved successfully',
        data: {
          influencers: [
            {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              userId: 'u1b2c3d4-e5f6-7890-abcd-ef1234567890',
              notes: 'Fashion influencer, 50k Instagram followers',
              isActive: true,
              createdAt: '2026-03-01T10:00:00.000Z',
              updatedAt: '2026-03-01T10:00:00.000Z',
              user: {
                id: 'u1b2c3d4-e5f6-7890-abcd-ef1234567890',
                firstName: 'Amara',
                lastName: 'Okafor',
                email: 'amara@example.com',
                phone: '+2348012345678',
              },
              _count: { discountCodes: 1, influencerRewards: 5 },
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      },
    },
  })
  async findAll(@Query() query: QueryInfluencersDto) {
    const data = await this.influencerService.findAll(query);
    return {
      success: true,
      message: 'Influencers retrieved successfully',
      data,
    };
  }

  // ─── Get One ──────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Get influencer details',
    description:
      'Returns full profile with user info, discount codes, recent rewards, and total earned.',
  })
  @ApiParam({ name: 'id', description: 'Influencer ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Influencer retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Influencer retrieved successfully',
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          userId: 'u1b2c3d4-e5f6-7890-abcd-ef1234567890',
          notes: null,
          isActive: true,
          totalEarned: 4500,
          user: {
            id: 'u1b2c3d4',
            firstName: 'Amara',
            lastName: 'Okafor',
            email: 'amara@example.com',
            phone: '+2348012345678',
          },
          discountCodes: [
            {
              id: 'dc1',
              code: 'AMARA10',
              name: "Amara's Code",
              percentage: 10,
              isActive: true,
              usedCount: 5,
              expiresAt: null,
            },
          ],
          influencerRewards: [
            {
              id: 'r1',
              rewardAmount: 900,
              status: 'REWARDED',
              createdAt: '2026-03-01T10:00:00.000Z',
            },
          ],
          _count: { discountCodes: 1, influencerRewards: 5 },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Influencer not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.influencerService.findOne(id);
    return {
      success: true,
      message: 'Influencer retrieved successfully',
      data,
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({
    summary: 'Update influencer',
    description:
      'Update notes or active status. To demote, set isActive to false.',
  })
  @ApiParam({ name: 'id', description: 'Influencer ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Influencer updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Influencer updated successfully',
        data: {
          id: 'a1b2c3d4',
          notes: 'Updated notes',
          isActive: false,
          user: {
            firstName: 'Amara',
            lastName: 'Okafor',
            email: 'amara@example.com',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Influencer not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInfluencerDto,
  ) {
    const data = await this.influencerService.update(id, dto);
    return { success: true, message: 'Influencer updated successfully', data };
  }

  // ─── Demote (soft) ────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Demote influencer',
    description:
      'Deactivates the influencer and all their discount codes. The user account is NOT deleted. Existing rewards are retained.',
  })
  @ApiParam({ name: 'id', description: 'Influencer ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Influencer demoted successfully' })
  @ApiResponse({ status: 404, description: 'Influencer not found' })
  async demote(@Param('id', ParseUUIDPipe) id: string) {
    await this.influencerService.demoteById(id);
    return { success: true, message: 'Influencer demoted successfully' };
  }
}
