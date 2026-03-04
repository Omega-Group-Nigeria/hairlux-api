import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { DiscountService } from './discount.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { QueryDiscountsDto } from './dto/query-discounts.dto';
import { CreateInfluencerDiscountDto } from './dto/create-influencer-discount.dto';
import { UpdateInfluencerRewardSettingsDto } from './dto/update-influencer-reward-settings.dto';
import { QueryInfluencerDiscountsDto } from './dto/query-influencer-discounts.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin - Discounts')
@ApiBearerAuth('JWT-auth')
@Controller('admin/discounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminDiscountController {
  constructor(private readonly discountService: DiscountService) {}

  // ─── General Discount Codes ──────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Create a discount code',
    description:
      'Create a new discount code with a percentage off. Code is auto-uppercased.',
  })
  @ApiResponse({
    status: 201,
    description: 'Discount code created successfully',
    example: {
      success: true,
      message: 'Discount code created successfully',
      data: {
        id: 'uuid',
        code: 'SUMMER20',
        name: 'Summer Sale',
        percentage: 20,
        isActive: true,
        expiresAt: '2026-12-31T00:00:00.000Z',
        maxUses: 100,
        usedCount: 0,
        createdAt: '2026-02-22T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Discount code already exists' })
  async create(@Body() dto: CreateDiscountDto) {
    const data = await this.discountService.create(dto);
    return {
      success: true,
      message: 'Discount code created successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List all discount codes',
    description:
      'Returns all codes with pagination. Filter by isActive or search by code/name.',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount codes retrieved successfully',
    example: {
      success: true,
      message: 'Discount codes retrieved successfully',
      data: {
        discounts: [],
        pagination: { page: 1, limit: 20, total: 5, totalPages: 1 },
      },
    },
  })
  async findAll(@Query() query: QueryDiscountsDto) {
    const data = await this.discountService.findAll(query);
    return {
      success: true,
      message: 'Discount codes retrieved successfully',
      data,
    };
  }

  // ─── Influencer Reward Settings ──────────────────────────────────────────
  // NOTE: these routes MUST appear before /:id to prevent `influencer-settings`
  // being matched as a param value.

  @Get('influencer-settings')
  @ApiOperation({
    summary: 'Get influencer reward settings',
    description:
      'Returns the global influencer reward configuration (reward type, value, minimum purchase). ' +
      'Auto-creates default settings if none exist.',
  })
  @ApiResponse({
    status: 200,
    description: 'Settings retrieved',
    example: {
      success: true,
      message: 'Influencer reward settings retrieved',
      data: {
        id: 'uuid',
        isActive: true,
        rewardType: 'FIXED',
        rewardValue: '500.00',
        minPurchaseAmount: '1000.00',
      },
    },
  })
  async getInfluencerRewardSettings() {
    const data = await this.discountService.getInfluencerRewardSettings();
    return {
      success: true,
      message: 'Influencer reward settings retrieved',
      data,
    };
  }

  @Put('influencer-settings')
  @ApiOperation({
    summary: 'Update influencer reward settings',
    description:
      'Configure the reward that influencers earn when their discount code is used at checkout. ' +
      'Set rewardType to FIXED (flat amount in ₦) or PERCENTAGE (% of discount given). ' +
      'Set isActive: false to disable rewards globally without deleting configuration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Settings updated',
    example: {
      success: true,
      message: 'Influencer reward settings updated',
      data: {
        id: 'uuid',
        isActive: true,
        rewardType: 'FIXED',
        rewardValue: '500.00',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Percentage reward value exceeds 100',
  })
  async updateInfluencerRewardSettings(
    @Body() dto: UpdateInfluencerRewardSettingsDto,
  ) {
    const data = await this.discountService.updateInfluencerRewardSettings(dto);
    return {
      success: true,
      message: 'Influencer reward settings updated',
      data,
    };
  }

  // ─── Influencer Discount Codes ───────────────────────────────────────────

  @Post('influencer')
  @ApiOperation({
    summary: 'Create an influencer discount code',
    description:
      'Assign a personalised discount code to an Influencer record. ' +
      'When customers use this code at checkout, the influencer earns a reward based on the global settings.',
  })
  @ApiResponse({
    status: 201,
    description: 'Influencer discount code created',
    example: {
      success: true,
      message: 'Influencer discount code created',
      data: {
        id: 'dc-uuid-1',
        code: 'AMARA20',
        name: "Amara's 20% Off",
        percentage: 20,
        type: 'INFLUENCER',
        isActive: true,
        influencerId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        influencer: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'Amara Okafor',
          phone: '+2348012345678',
          email: 'amara@example.com',
          isActive: true,
        },
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        createdAt: '2026-02-28T10:00:00.000Z',
        updatedAt: '2026-02-28T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'Influencer record not found',
    example: { statusCode: 404, message: 'Influencer not found' },
  })
  @ApiResponse({
    status: 409,
    description: 'A discount code with that code already exists',
    example: {
      statusCode: 409,
      message: 'Discount code "AMARA20" already exists',
    },
  })
  async createInfluencerDiscount(@Body() dto: CreateInfluencerDiscountDto) {
    const data = await this.discountService.createInfluencerDiscount(dto);
    return {
      success: true,
      message: 'Influencer discount code created',
      data,
    };
  }

  @Get('influencer')
  @ApiOperation({
    summary: 'List all influencer discount codes',
    description:
      'Returns all INFLUENCER type discount codes with their earnings stats and influencer details. ' +
      'Filter by influencerId, isActive, or search by code/name.',
  })
  @ApiResponse({
    status: 200,
    description: 'Influencer discount codes retrieved',
    example: {
      success: true,
      message: 'Influencer discount codes retrieved',
      data: {
        discounts: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    },
  })
  async findAllInfluencerDiscounts(
    @Query() query: QueryInfluencerDiscountsDto,
  ) {
    const data = await this.discountService.findAllInfluencerDiscounts(query);
    return {
      success: true,
      message: 'Influencer discount codes retrieved',
      data,
    };
  }

  @Get('influencer/:id')
  @ApiOperation({
    summary: 'Get an influencer discount code by ID',
    description:
      'Returns complete details including all usage history, per-usage rewards, and aggregate stats.',
  })
  @ApiParam({
    name: 'id',
    description: 'Discount code UUID',
    example: 'dc-uuid-1',
  })
  @ApiResponse({
    status: 200,
    description: 'Influencer discount code retrieved',
    example: {
      success: true,
      message: 'Influencer discount code retrieved',
      data: {
        id: 'dc-uuid-1',
        code: 'AMARA20',
        name: "Amara's 20% Off",
        percentage: 20,
        type: 'INFLUENCER',
        isActive: true,
        influencerId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        influencer: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'Amara Okafor',
          phone: '+2348012345678',
          email: 'amara@example.com',
          isActive: true,
        },
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 14,
        usages: [
          {
            id: 'usage-uuid-1',
            userId: 'user-uuid-1',
            discountAmount: '3000.00',
            createdAt: '2026-02-20T09:00:00.000Z',
            booking: { id: 'booking-uuid-1', totalAmount: '15000.00' },
            influencerReward: {
              id: 'rw-uuid-1',
              rewardAmount: '500.00',
              status: 'PENDING',
            },
          },
        ],
        stats: {
          totalUsages: 14,
          totalDiscountGiven: '42000.00',
          totalRewardsPending: '7000.00',
          totalRewardsPaid: '0.00',
        },
        createdAt: '2026-02-28T10:00:00.000Z',
        updatedAt: '2026-02-28T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required',
  })
  @ApiResponse({
    status: 400,
    description: 'Not an influencer discount code',
    example: {
      statusCode: 400,
      message: 'This discount code is not an INFLUENCER type',
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Influencer discount code not found',
    example: { statusCode: 404, message: 'Discount code not found' },
  })
  async findOneInfluencerDiscount(@Param('id') id: string) {
    const data = await this.discountService.findOneInfluencerDiscount(id);
    return {
      success: true,
      message: 'Influencer discount code retrieved',
      data,
    };
  }

  @Delete('influencer/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an influencer discount code',
    description:
      'Permanently deletes an influencer discount code and all associated usages. ' +
      'Processed rewards are preserved in transaction history.',
  })
  @ApiParam({
    name: 'id',
    description: 'Discount code UUID',
    example: 'dc-uuid-1',
  })
  @ApiResponse({
    status: 200,
    description: 'Influencer discount code deleted',
    example: { success: true, message: 'Influencer discount code deleted' },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required',
  })
  @ApiResponse({
    status: 400,
    description: 'Not an influencer discount code',
    example: {
      statusCode: 400,
      message: 'This discount code is not an INFLUENCER type',
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Influencer discount code not found',
    example: { statusCode: 404, message: 'Discount code not found' },
  })
  async deleteInfluencerDiscount(@Param('id') id: string) {
    await this.discountService.deleteInfluencerDiscount(id);
    return { success: true, message: 'Influencer discount code deleted' };
  }

  // ─── General Discount Codes (by ID) ──────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Get a discount code by ID',
    description:
      'Returns full details of a single discount code including usage count.',
  })
  @ApiParam({
    name: 'id',
    description: 'Discount code UUID',
    example: 'dc-uuid-2',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount code retrieved successfully',
    example: {
      success: true,
      message: 'Discount code retrieved successfully',
      data: {
        id: 'dc-uuid-2',
        code: 'SUMMER20',
        name: 'Summer Sale',
        percentage: 20,
        type: 'GENERAL',
        isActive: true,
        influencerId: null,
        startsAt: '2026-06-01T00:00:00.000Z',
        expiresAt: '2026-08-31T23:59:59.000Z',
        maxUses: 100,
        usedCount: 34,
        createdAt: '2026-02-22T10:00:00.000Z',
        updatedAt: '2026-02-28T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'Discount code not found',
    example: { statusCode: 404, message: 'Discount code not found' },
  })
  async findOne(@Param('id') id: string) {
    const data = await this.discountService.findOne(id);
    return {
      success: true,
      message: 'Discount code retrieved successfully',
      data,
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a discount code',
    description:
      'Update any field on a discount code. To remove expiry or maxUses, pass null explicitly.',
  })
  @ApiParam({
    name: 'id',
    description: 'Discount code UUID',
    example: 'dc-uuid-2',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount code updated successfully',
    example: {
      success: true,
      message: 'Discount code updated successfully',
      data: {
        id: 'dc-uuid-2',
        code: 'SUMMER20',
        name: 'Summer Sale — Extended',
        percentage: 25,
        type: 'GENERAL',
        isActive: true,
        influencerId: null,
        startsAt: '2026-06-01T00:00:00.000Z',
        expiresAt: '2026-09-30T23:59:59.000Z',
        maxUses: 200,
        usedCount: 34,
        createdAt: '2026-02-22T10:00:00.000Z',
        updatedAt: '2026-02-28T13:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'Discount code not found',
    example: { statusCode: 404, message: 'Discount code not found' },
  })
  async update(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
    const data = await this.discountService.update(id, dto);
    return {
      success: true,
      message: 'Discount code updated successfully',
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a discount code',
    description:
      'Permanently delete a general discount code. Cannot be used on INFLUENCER type codes — use DELETE /admin/discounts/influencer/:id instead.',
  })
  @ApiParam({
    name: 'id',
    description: 'Discount code UUID',
    example: 'dc-uuid-2',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount code deleted successfully',
    example: { success: true, message: 'Discount code deleted successfully' },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'Discount code not found',
    example: { statusCode: 404, message: 'Discount code not found' },
  })
  async remove(@Param('id') id: string) {
    await this.discountService.remove(id);
    return { success: true, message: 'Discount code deleted successfully' };
  }
}
