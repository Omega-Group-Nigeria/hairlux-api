import {
  Controller,
  Get,
  Post,
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
  ApiQuery,
} from '@nestjs/swagger';
import { InfluencerService } from './influencer.service';
import { CreateInfluencerDto } from './dto/create-influencer.dto';
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

  // ─── Create ───────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Create a new influencer',
    description:
      'Register an influencer record that can be linked to discount codes.',
  })
  @ApiResponse({
    status: 201,
    description: 'Influencer created successfully',
    example: {
      success: true,
      message: 'Influencer created successfully',
      data: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Amara Okafor',
        phone: '+2348012345678',
        email: 'amara@example.com',
        notes: 'Fashion influencer, 50k Instagram followers',
        isActive: true,
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
    status: 409,
    description: 'Phone number already registered to another influencer',
    example: {
      statusCode: 409,
      message: 'An influencer with phone "+2348012345678" already exists',
    },
  })
  async create(@Body() dto: CreateInfluencerDto) {
    const data = await this.influencerService.create(dto);
    return { success: true, message: 'Influencer created successfully', data };
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List all influencers',
    description:
      'Paginated list of influencers with optional search and active filter.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, phone, or email',
    example: 'Amara',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    enum: ['true', 'false'],
    description: 'Filter by active status',
  })
  @ApiResponse({
    status: 200,
    description: 'Influencers retrieved successfully',
    example: {
      success: true,
      message: 'Influencers retrieved successfully',
      data: {
        influencers: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            name: 'Amara Okafor',
            phone: '+2348012345678',
            email: 'amara@example.com',
            notes: 'Fashion influencer',
            isActive: true,
            createdAt: '2026-02-28T10:00:00.000Z',
            updatedAt: '2026-02-28T10:00:00.000Z',
            _count: { discountCodes: 2 },
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required',
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
    summary: 'Get influencer by ID',
    description:
      'Returns influencer details including their discount codes, recent rewards, and total earnings.',
  })
  @ApiParam({
    name: 'id',
    description: 'Influencer UUID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Influencer retrieved successfully',
    example: {
      success: true,
      message: 'Influencer retrieved successfully',
      data: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Amara Okafor',
        phone: '+2348012345678',
        email: 'amara@example.com',
        notes: 'Fashion influencer, 50k Instagram followers',
        isActive: true,
        createdAt: '2026-02-28T10:00:00.000Z',
        updatedAt: '2026-02-28T10:00:00.000Z',
        discountCodes: [
          {
            id: 'dc-uuid-1',
            code: 'AMARA20',
            name: "Amara's 20% Off",
            percentage: 20,
            isActive: true,
            usedCount: 14,
            expiresAt: null,
          },
        ],
        influencerRewards: [
          {
            id: 'rw-uuid-1',
            rewardAmount: '500.00',
            status: 'PENDING',
            createdAt: '2026-02-28T11:00:00.000Z',
          },
        ],
        _count: { discountCodes: 1, influencerRewards: 14 },
        totalEarned: 3500,
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
    description: 'Influencer not found',
    example: { statusCode: 404, message: 'Influencer not found' },
  })
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
    summary: 'Update influencer details',
    description:
      'Update any field on an influencer. Only provided fields are changed.',
  })
  @ApiParam({
    name: 'id',
    description: 'Influencer UUID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Influencer updated successfully',
    example: {
      success: true,
      message: 'Influencer updated successfully',
      data: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Amara Okafor',
        phone: '+2348012345678',
        email: 'amara.updated@example.com',
        notes: 'Updated notes',
        isActive: false,
        createdAt: '2026-02-28T10:00:00.000Z',
        updatedAt: '2026-02-28T12:00:00.000Z',
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
    description: 'Influencer not found',
    example: { statusCode: 404, message: 'Influencer not found' },
  })
  @ApiResponse({
    status: 409,
    description: 'Phone number already in use by another influencer',
    example: {
      statusCode: 409,
      message: 'Phone already in use by another influencer',
    },
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInfluencerDto,
  ) {
    const data = await this.influencerService.update(id, dto);
    return { success: true, message: 'Influencer updated successfully', data };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an influencer',
    description:
      'Permanently deletes the influencer record. Associated discount codes will have their influencerId set to null (cascading SetNull). ' +
      'Reward records are preserved for audit purposes.',
  })
  @ApiParam({
    name: 'id',
    description: 'Influencer UUID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Influencer deleted successfully',
    example: { success: true, message: 'Influencer deleted successfully' },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'Influencer not found',
    example: { statusCode: 404, message: 'Influencer not found' },
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.influencerService.remove(id);
    return { success: true, message: 'Influencer deleted successfully' };
  }
}
