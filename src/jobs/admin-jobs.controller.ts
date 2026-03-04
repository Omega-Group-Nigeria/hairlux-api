import {
  Controller,
  Get,
  Post,
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
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { QueryJobsDto } from './dto/query-jobs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Admin - Jobs')
@ApiBearerAuth('JWT-auth')
@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminJobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a job posting',
    description:
      'Creates a new job posting. Set `isActive: true` to publish immediately, or omit to save as draft.',
  })
  @ApiResponse({
    status: 201,
    description: 'Job posting created successfully',
    schema: {
      example: {
        success: true,
        message: 'Job posting created successfully',
        data: {
          id: 'abc123',
          title: 'Senior Hair Stylist',
          type: 'FULL_TIME',
          location: 'Lagos, Nigeria',
          description: '## About the Role\n\nWe are looking for...',
          responsibilities: [
            'Perform hair styling services',
            'Maintain a clean workstation',
          ],
          isActive: false,
          closingDate: null,
          createdAt: '2026-03-02T10:00:00.000Z',
          updatedAt: '2026-03-02T10:00:00.000Z',
        },
      },
    },
  })
  async create(@Body() dto: CreateJobDto) {
    const data = await this.jobsService.create(dto);
    return {
      success: true,
      message: 'Job posting created successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List all job postings (admin)',
    description: 'Returns all job postings including drafts, paginated.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE'],
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Job postings retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Job postings retrieved successfully',
        data: {
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        },
      },
    },
  })
  async findAll(@Query() query: QueryJobsDto) {
    const data = await this.jobsService.findAllAdmin(query);
    return {
      success: true,
      message: 'Job postings retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single job posting (admin)' })
  @ApiParam({ name: 'id', description: 'Job posting ID' })
  @ApiResponse({
    status: 200,
    description: 'Job posting retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Job posting not found' })
  async findOne(@Param('id') id: string) {
    const data = await this.jobsService.findOneAdmin(id);
    return {
      success: true,
      message: 'Job posting retrieved successfully',
      data,
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a job posting',
    description: 'Partial update — only provided fields are changed.',
  })
  @ApiParam({ name: 'id', description: 'Job posting ID' })
  @ApiResponse({ status: 200, description: 'Job posting updated successfully' })
  @ApiResponse({ status: 404, description: 'Job posting not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateJobDto) {
    const data = await this.jobsService.update(id, dto);
    return {
      success: true,
      message: 'Job posting updated successfully',
      data,
    };
  }

  @Patch(':id/toggle')
  @ApiOperation({
    summary: 'Toggle publish/unpublish',
    description:
      'Flips `isActive` — publishes a draft or unpublishes a live post.',
  })
  @ApiParam({ name: 'id', description: 'Job posting ID' })
  @ApiResponse({
    status: 200,
    description: 'Job posting status toggled',
    schema: {
      example: {
        success: true,
        message: 'Job posting published',
        data: {
          id: 'abc123',
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Job posting not found' })
  async toggle(@Param('id') id: string) {
    const data = await this.jobsService.toggle(id);
    return {
      success: true,
      message: data.isActive
        ? 'Job posting published'
        : 'Job posting unpublished',
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a job posting' })
  @ApiParam({ name: 'id', description: 'Job posting ID' })
  @ApiResponse({ status: 200, description: 'Job posting deleted successfully' })
  @ApiResponse({ status: 404, description: 'Job posting not found' })
  async remove(@Param('id') id: string) {
    await this.jobsService.remove(id);
    return {
      success: true,
      message: 'Job posting deleted successfully',
    };
  }
}
