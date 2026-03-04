import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Admin - Roles & Permissions')
@ApiBearerAuth('JWT-auth')
@Controller('admin/roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // ── Permission catalogue ──────────────────────────────────────────────────────

  @Get('permissions')
  @ApiOperation({
    summary: 'Get full permission catalogue',
    description:
      'Returns all available permissions grouped by resource — use this to render the checkbox UI when creating or editing a role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Permission catalogue',
    schema: {
      example: {
        success: true,
        message: 'Permission catalogue retrieved',
        data: {
          total: 52,
          groups: [
            {
              group: 'Bookings',
              permissions: [
                { key: 'bookings:read', label: 'View bookings' },
                { key: 'bookings:create', label: 'Create bookings' },
                {
                  key: 'bookings:update_status',
                  label: 'Update booking status',
                },
                {
                  key: 'bookings:verify_reservation',
                  label: 'Verify reservation codes',
                },
                { key: 'bookings:delete', label: 'Delete bookings' },
              ],
            },
          ],
        },
      },
    },
  })
  getPermissions() {
    return {
      success: true,
      message: 'Permission catalogue retrieved',
      data: this.rolesService.getPermissionCatalogue(),
    };
  }

  // ── Roles CRUD ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Create admin role',
    description:
      'Creates a new named admin role (initially with no permissions). Use PUT /:id/permissions to assign permissions.',
  })
  @ApiResponse({
    status: 201,
    description: 'Role created',
    schema: {
      example: {
        success: true,
        message: 'Role created successfully',
        data: {
          id: 'uuid',
          name: 'Receptionist',
          description: 'Handles front-desk bookings',
          isActive: true,
          permissions: [],
          userCount: 0,
          createdAt: '2026-03-03T10:00:00.000Z',
          updatedAt: '2026-03-03T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Role name already exists' })
  async create(@Body() dto: CreateRoleDto) {
    const data = await this.rolesService.create(dto);
    return { success: true, message: 'Role created successfully', data };
  }

  @Get()
  @ApiOperation({
    summary: 'List all admin roles',
    description:
      'Returns all roles with their permission count and assigned user count.',
  })
  @ApiResponse({
    status: 200,
    description: 'Roles retrieved',
    schema: {
      example: {
        success: true,
        message: 'Roles retrieved successfully',
        data: [
          {
            id: 'uuid',
            name: 'Receptionist',
            description: null,
            isActive: true,
            permissions: ['bookings:read', 'bookings:update_status'],
            userCount: 3,
            createdAt: '2026-03-03T10:00:00.000Z',
            updatedAt: '2026-03-03T10:00:00.000Z',
          },
        ],
      },
    },
  })
  async findAll() {
    const data = await this.rolesService.findAll();
    return { success: true, message: 'Roles retrieved successfully', data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a role with its full permission set' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role retrieved' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async findOne(@Param('id') id: string) {
    const data = await this.rolesService.findOne(id);
    return { success: true, message: 'Role retrieved successfully', data };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update role name / description / active status',
    description:
      'Partial update — does NOT touch permissions (use PUT /:id/permissions for that).',
  })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 409, description: 'Role name already taken' })
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const data = await this.rolesService.update(id, dto);
    return { success: true, message: 'Role updated successfully', data };
  }

  @Put(':id/permissions')
  @ApiOperation({
    summary: 'Set permissions for a role',
    description:
      'Completely replaces the permission set for this role. Send `permissions: []` to remove all. Redis cache is invalidated so changes take effect immediately.',
  })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({
    status: 200,
    description: 'Permissions updated',
    schema: {
      example: {
        success: true,
        message: 'Permissions updated successfully',
        data: {
          id: 'uuid',
          name: 'Receptionist',
          permissions: [
            'bookings:read',
            'bookings:update_status',
            'users:read',
          ],
          userCount: 3,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Unknown permission key(s)' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async setPermissions(
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    const data = await this.rolesService.setPermissions(id, dto);
    return { success: true, message: 'Permissions updated successfully', data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an admin role',
    description: 'Blocked if any users are currently assigned to this role.',
  })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role deleted' })
  @ApiResponse({ status: 400, description: 'Role still has assigned users' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async remove(@Param('id') id: string) {
    await this.rolesService.remove(id);
    return { success: true, message: 'Role deleted successfully' };
  }
}
