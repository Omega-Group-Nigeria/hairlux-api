import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { QueryJobsDto } from './dto/query-jobs.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'List active job postings',
    description:
      'Returns all published, non-expired job postings. Filterable by employment type.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE'],
    description: 'Filter by employment type',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Results per page (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Job postings retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Job postings retrieved successfully',
        data: {
          data: [
            {
              id: 'abc123',
              title: 'Senior Hair Stylist',
              type: 'FULL_TIME',
              location: 'Lagos, Nigeria',
              description: '## About the Role\n\nWe are looking for...',
              responsibilities: [
                'Perform hair styling services for clients',
                'Maintain a clean workstation',
              ],
              isActive: true,
              closingDate: '2026-04-30T23:59:59.000Z',
              createdAt: '2026-03-01T10:00:00.000Z',
              updatedAt: '2026-03-01T10:00:00.000Z',
            },
          ],
          meta: {
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
        },
      },
    },
  })
  async findAll(@Query() query: QueryJobsDto) {
    const data = await this.jobsService.findAllPublic(query);
    return {
      success: true,
      message: 'Job postings retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Get a single job posting',
    description: 'Returns a published, non-expired job posting by ID.',
  })
  @ApiParam({ name: 'id', description: 'Job posting ID' })
  @ApiResponse({
    status: 200,
    description: 'Job posting retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Job posting retrieved successfully',
        data: {
          id: 'abc123',
          title: 'Senior Hair Stylist',
          type: 'FULL_TIME',
          location: 'Lagos, Nigeria',
          description: '## About the Role\n\nWe are looking for...',
          responsibilities: [
            'Perform hair styling services for clients',
            'Maintain a clean workstation',
          ],
          isActive: true,
          closingDate: '2026-04-30T23:59:59.000Z',
          createdAt: '2026-03-01T10:00:00.000Z',
          updatedAt: '2026-03-01T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Job posting not found' })
  async findOne(@Param('id') id: string) {
    const data = await this.jobsService.findOnePublic(id);
    return {
      success: true,
      message: 'Job posting retrieved successfully',
      data,
    };
  }
}
