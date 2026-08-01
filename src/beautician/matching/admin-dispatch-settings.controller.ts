import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permission } from '../../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { DispatchConfigAdminService } from './services/dispatch-config-admin.service';
import { UpdateDispatchSettingsDto } from './dto/update-dispatch-settings.dto';

@ApiTags('Admin – Dispatch Settings')
@ApiBearerAuth('JWT-auth')
@Controller('admin/settings/dispatch')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminDispatchSettingsController {
  constructor(
    private readonly dispatchConfigAdmin: DispatchConfigAdminService,
  ) {}

  @Get()
  @Permission(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Get dispatch engine settings' })
  @ApiResponse({ status: 200, description: 'Dispatch settings retrieved' })
  async getSettings() {
    const data = await this.dispatchConfigAdmin.getSettings();
    return {
      success: true,
      message: 'Dispatch settings retrieved successfully',
      data,
    };
  }

  @Put()
  @Permission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update dispatch engine settings' })
  @ApiResponse({ status: 200, description: 'Dispatch settings updated' })
  async updateSettings(@Body() dto: UpdateDispatchSettingsDto) {
    const data = await this.dispatchConfigAdmin.updateSettings(dto);
    return {
      success: true,
      message: 'Dispatch settings updated successfully',
      data,
    };
  }
}