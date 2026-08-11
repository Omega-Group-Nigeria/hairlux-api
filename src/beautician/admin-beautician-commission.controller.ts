import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
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
import { BeauticianCommissionRateService } from './payout/services/beautician-commission-rate.service';
import { UpsertBeauticianCommissionRateDto } from './payout/dto/upsert-beautician-commission-rate.dto';

@ApiTags('Admin – Beautician Commission Rates')
@ApiBearerAuth('JWT-auth')
@Controller('admin/settings/beautician-commission-rates')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminBeauticianCommissionController {
  constructor(
    private readonly beauticianCommissionRateService: BeauticianCommissionRateService,
  ) {}

  @Get()
  @Permission(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({
    summary: 'List beautician commission overrides',
    description:
      'Only beauticians with an explicit override are listed. Beauticians without a row fall back to the service override, then HomeServiceSettings.commissionRate.',
  })
  @ApiResponse({ status: 200, description: 'Overrides retrieved successfully' })
  async list() {
    const data = await this.beauticianCommissionRateService.listOverrides();
    return {
      success: true,
      message: 'Beautician commission overrides retrieved successfully',
      data,
    };
  }

  @Put(':beauticianUserId')
  @Permission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Set commission rate for a beautician',
    description:
      'Upsert an override for one beautician. It wins over the per-service override and the platform default for every home-service job assigned to this beautician.',
  })
  @ApiParam({ name: 'beauticianUserId', description: 'Beautician user ID' })
  @ApiResponse({ status: 200, description: 'Override saved successfully' })
  @ApiResponse({ status: 404, description: 'Beautician user not found' })
  async upsert(
    @Param('beauticianUserId', ParseUUIDPipe) beauticianUserId: string,
    @Body() dto: UpsertBeauticianCommissionRateDto,
  ) {
    const data = await this.beauticianCommissionRateService.upsertOverride(
      beauticianUserId,
      dto.commissionRate,
    );
    return {
      success: true,
      message: 'Beautician commission override saved successfully',
      data,
    };
  }

  @Delete(':beauticianUserId')
  @Permission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Remove commission override for a beautician',
    description:
      'After removal the beautician falls back to the service override, then the platform default rate.',
  })
  @ApiParam({ name: 'beauticianUserId', description: 'Beautician user ID' })
  @ApiResponse({ status: 200, description: 'Override removed successfully' })
  @ApiResponse({ status: 404, description: 'No override for this beautician' })
  async remove(
    @Param('beauticianUserId', ParseUUIDPipe) beauticianUserId: string,
  ) {
    await this.beauticianCommissionRateService.removeOverride(beauticianUserId);
    return {
      success: true,
      message: 'Beautician commission override removed successfully',
      data: null,
    };
  }
}
