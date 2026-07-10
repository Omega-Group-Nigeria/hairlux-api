import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { HomeServiceSettingsService } from './services/home-service-settings.service';
import { UpdateHomeServiceSettingsDto } from './dto/update-home-service-settings.dto';

@ApiTags('Admin – Home Service Settings')
@ApiBearerAuth('JWT-auth')
@Controller('admin/settings/home-service')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminHomeServiceSettingsController {
  constructor(
    private readonly homeServiceSettingsService: HomeServiceSettingsService,
  ) {}

  @Get()
  @Permission(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Get home service settings' })
  @ApiResponse({ status: 200, description: 'Settings retrieved successfully' })
  async getSettings() {
    const data = await this.homeServiceSettingsService.getSettings();
    return {
      success: true,
      message: 'Home service settings retrieved successfully',
      data,
    };
  }

  @Put()
  @Permission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Update home service settings',
    description:
      'Partial update. Set dailyPayoutLimit (Naira) for the platform-wide daily payout pool, or null to remove the limit.',
  })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  async updateSettings(@Body() dto: UpdateHomeServiceSettingsDto) {
    const data = await this.homeServiceSettingsService.updateSettings(dto);
    return {
      success: true,
      message: 'Home service settings updated successfully',
      data,
    };
  }
}