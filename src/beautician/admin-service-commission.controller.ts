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
import { ServiceCommissionRateService } from './payout/services/service-commission-rate.service';
import { UpsertServiceCommissionRateDto } from './payout/dto/upsert-service-commission-rate.dto';

@ApiTags('Admin – Service Commission Rates')
@ApiBearerAuth('JWT-auth')
@Controller('admin/settings/service-commission-rates')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminServiceCommissionController {
  constructor(
    private readonly serviceCommissionRateService: ServiceCommissionRateService,
  ) {}

  @Get()
  @Permission(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({
    summary: 'List service commission overrides',
    description:
      'Only services with an explicit override are listed. All other services use HomeServiceSettings.commissionRate.',
  })
  @ApiResponse({ status: 200, description: 'Overrides retrieved successfully' })
  async list() {
    const data = await this.serviceCommissionRateService.listOverrides();
    return {
      success: true,
      message: 'Service commission overrides retrieved successfully',
      data,
    };
  }

  @Put(':serviceId')
  @Permission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Set commission rate for a service',
    description:
      'Upsert an override for one catalog service. Other services keep the platform default rate.',
  })
  @ApiParam({ name: 'serviceId', description: 'Service catalog ID' })
  @ApiResponse({ status: 200, description: 'Override saved successfully' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async upsert(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: UpsertServiceCommissionRateDto,
  ) {
    const data = await this.serviceCommissionRateService.upsertOverride(
      serviceId,
      dto.commissionRate,
    );
    return {
      success: true,
      message: 'Service commission override saved successfully',
      data,
    };
  }

  @Delete(':serviceId')
  @Permission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Remove commission override for a service',
    description:
      'After removal the service uses HomeServiceSettings.commissionRate again.',
  })
  @ApiParam({ name: 'serviceId', description: 'Service catalog ID' })
  @ApiResponse({ status: 200, description: 'Override removed successfully' })
  @ApiResponse({ status: 404, description: 'No override for this service' })
  async remove(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    await this.serviceCommissionRateService.removeOverride(serviceId);
    return {
      success: true,
      message: 'Service commission override removed successfully',
      data: null,
    };
  }
}
