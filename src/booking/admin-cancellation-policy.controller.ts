import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
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
import { BookingCancellationPolicyService } from './services/booking-cancellation-policy.service';
import { UpdateCancellationPolicyDto } from './dto/update-cancellation-policy.dto';

@ApiTags('Admin - Booking Cancellation Policy')
@ApiBearerAuth('JWT-auth')
@Controller('admin/bookings/cancellation-policy')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminCancellationPolicyController {
  constructor(
    private readonly cancellationPolicyService: BookingCancellationPolicyService,
  ) {}

  @Get()
  @Permission(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({
    summary: 'Get booking cancellation policy rules',
    description:
      'Returns admin-configurable cancellation rules for walk-in/branch and home/mobile service bookings.',
  })
  @ApiResponse({ status: 200, description: 'Policy rules retrieved successfully' })
  async getPolicies() {
    const data = await this.cancellationPolicyService.getPolicies();
    return {
      success: true,
      message: 'Cancellation policy retrieved successfully',
      data,
    };
  }

  @Put()
  @Permission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Update booking cancellation policy rules',
    description:
      'Partial update per category. Refund and forfeiture percentages must sum to 100 for each rule.',
  })
  @ApiResponse({ status: 200, description: 'Policy rules updated successfully' })
  async updatePolicies(@Body() dto: UpdateCancellationPolicyDto) {
    const data = await this.cancellationPolicyService.updatePolicies(dto);
    return {
      success: true,
      message: 'Cancellation policy updated successfully',
      data,
    };
  }
}
