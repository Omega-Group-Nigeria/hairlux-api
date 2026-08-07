import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
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
  constructor(private readonly rolesService: RolesService) { }

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
  async create(@Req() req: any, @Body() dto: CreateRoleDto) {
    const data = await this.rolesService.create(dto, req.user?.id);
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

  @Get(':id/users')
  @ApiOperation({
    summary: 'List every user holding this role',
    description: 'Includes both users for whom this is their primary role AND anyone holding it as a secondary role — the userCount shown on the role itself is the sum of both.',
  })
  @ApiParam({ name: 'id', description: 'Role ID' })
  async getRoleUsers(@Param('id') id: string) {
    const data = await this.rolesService.getRoleUsers(id);
    return { success: true, message: 'Retrieved successfully', data };
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
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const data = await this.rolesService.update(id, dto, req.user?.id);
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
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    const data = await this.rolesService.setPermissions(id, dto, req.user?.id);
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
  async remove(@Req() req: any, @Param('id') id: string) {
    await this.rolesService.remove(id, req.user?.id);
    return { success: true, message: 'Role deleted successfully' };
  }

  // ── Secondary roles (multi-role support) ─────────────────────────────────────

  @Get('users/:userId')
  @ApiOperation({
    summary: "Get a user's roles",
    description: 'Returns the primary role (User.adminRoleId) plus every secondary role assigned to this user.',
  })
  @ApiParam({ name: 'userId' })
  async getUserRoles(@Param('userId') userId: string) {
    const data = await this.rolesService.getUserRoles(userId);
    return { success: true, message: 'Retrieved successfully', data };
  }

  @Post('users/:userId/:adminRoleId')
  @ApiOperation({
    summary: 'Add a secondary role to a user',
    description: "Grants an additional role on top of the user's existing primary role — effective permissions become the union of both. Use PATCH /admin/users/:id/role (Admin Management) to change the primary role instead.",
  })
  @ApiParam({ name: 'userId' })
  @ApiParam({ name: 'adminRoleId' })
  async addUserRole(@Req() req: any, @Param('userId') userId: string, @Param('adminRoleId') adminRoleId: string) {
    const data = await this.rolesService.addUserRole(userId, adminRoleId, req.user?.id);
    return { success: true, message: 'Role added successfully', data };
  }

  @Delete('users/:userId/:adminRoleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a secondary role from a user — does not affect their primary role" })
  @ApiParam({ name: 'userId' })
  @ApiParam({ name: 'adminRoleId' })
  async removeUserRole(@Req() req: any, @Param('userId') userId: string, @Param('adminRoleId') adminRoleId: string) {
    const data = await this.rolesService.removeUserRole(userId, adminRoleId, req.user?.id);
    return { success: true, message: 'Role removed successfully', data };
  }

  // ── Audit trail ──────────────────────────────────────────────────────────────

  @Get('audit-log/all')
  @ApiOperation({
    summary: 'Role & permission change audit log',
    description: 'Every role create/update/delete, permission-set change, and secondary-role grant/revoke — who changed what, before/after, and when. Optionally filtered by role or target user.',
  })
  @ApiQuery({ name: 'adminRoleId', required: false })
  @ApiQuery({ name: 'targetUserId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getAuditLog(
    @Query('adminRoleId') adminRoleId?: string,
    @Query('targetUserId') targetUserId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.rolesService.getAuditLog({
      adminRoleId,
      targetUserId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return { success: true, message: 'Retrieved successfully', data };
  }
}