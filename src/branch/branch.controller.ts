import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { QueryServicesDto } from '../service-catalog/dto/query-services.dto';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { BranchService } from './branch.service';
import { QueryBranchesDto } from './dto/query-branches.dto';

@ApiTags('Branches')
@Controller('branches')
export class BranchController {
  constructor(
    private readonly branchService: BranchService,
    private readonly serviceCatalogService: ServiceCatalogService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List open branches',
    description:
      'Returns active branches for the customer branch picker (id + name).',
  })
  @ApiResponse({ status: 200, description: 'Branches retrieved successfully' })
  async listOpen(@Query() queryDto: QueryBranchesDto) {
    const data = await this.branchService.listOpenBranches(queryDto);
    return {
      success: true,
      message: 'Branches retrieved successfully',
      data,
    };
  }

  @Get(':id/services')
  @ApiOperation({
    summary: 'List services at a branch',
    description:
      'Alias of GET /services?branchId=:id — same response shape; walkInPrice resolved per branch.',
  })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 200, description: 'Services retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Branch not found or closed' })
  async listBranchServices(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() queryDto: QueryServicesDto,
  ) {
    const data = await this.serviceCatalogService.findAll({
      ...queryDto,
      branchId: id,
    });
    return {
      success: true,
      message: 'Services retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get open branch by ID' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 200, description: 'Branch retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Branch not found or closed' })
  async getOpen(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.branchService.getOpenBranch(id);
    return {
      success: true,
      message: 'Branch retrieved successfully',
      data,
    };
  }
}