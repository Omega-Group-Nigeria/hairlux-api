import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { BranchService } from './branch.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { PatchBranchServicesDto } from './dto/patch-branch-services.dto';
import { QueryAdminBranchesDto } from './dto/query-admin-branches.dto';
import { SetBranchServicesDto } from './dto/set-branch-services.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@ApiTags('Admin - Branches')
@ApiBearerAuth('JWT-auth')
@Controller('admin/branches')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminBranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @Permission(PERMISSIONS.BRANCHES_MANAGE)
  @ApiOperation({ summary: 'Create branch' })
  @ApiResponse({ status: 201, description: 'Branch created successfully' })
  async create(@Body() dto: CreateBranchDto) {
    const data = await this.branchService.createBranch(dto);
    return { success: true, message: 'Branch created successfully', data };
  }

  @Get()
  @Permission(PERMISSIONS.BRANCHES_READ)
  @ApiOperation({ summary: 'List branches (admin)' })
  @ApiResponse({ status: 200, description: 'Branches retrieved successfully' })
  async findAll(@Query() queryDto: QueryAdminBranchesDto) {
    const data = await this.branchService.findAllAdminBranches(queryDto);
    return {
      success: true,
      message: 'Branches retrieved successfully',
      data,
    };
  }

  @Get(':id/services')
  @Permission(PERMISSIONS.BRANCHES_READ)
  @ApiOperation({ summary: 'Branch service configuration matrix' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async getServiceMatrix(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.branchService.getAdminServiceMatrix(id);
    return {
      success: true,
      message: 'Branch services retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @Permission(PERMISSIONS.BRANCHES_READ)
  @ApiOperation({ summary: 'Get branch by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.branchService.findOneAdminBranch(id);
    return { success: true, message: 'Branch retrieved successfully', data };
  }

  @Patch(':id')
  @Permission(PERMISSIONS.BRANCHES_MANAGE)
  @ApiOperation({
    summary: 'Update branch',
    description: 'Update name and/or open (isActive) status.',
  })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    const data = await this.branchService.updateBranch(id, dto);
    return { success: true, message: 'Branch updated successfully', data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission(PERMISSIONS.BRANCHES_MANAGE)
  @ApiOperation({ summary: 'Delete branch' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.branchService.removeBranch(id);
    return { success: true, message: 'Branch deleted successfully' };
  }

  @Put(':id/services')
  @Permission(PERMISSIONS.BRANCHES_MANAGE)
  @ApiOperation({ summary: 'Set available services at branch' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async setServices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBranchServicesDto,
  ) {
    const data = await this.branchService.setBranchServices(id, dto);
    return {
      success: true,
      message: 'Branch services updated successfully',
      data,
    };
  }

  @Patch(':id/services')
  @Permission(PERMISSIONS.BRANCHES_MANAGE)
  @ApiOperation({
    summary: 'Partially update branch service availability or walk-in prices',
  })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async patchServices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchBranchServicesDto,
  ) {
    const data = await this.branchService.patchBranchServices(id, dto);
    return {
      success: true,
      message: 'Branch services updated successfully',
      data,
    };
  }
}