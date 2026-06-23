import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permission } from '../../auth/decorators/permission.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AdminPayoutService } from './services/admin-payout.service';
import { ProcessPayoutDto } from './dto/process-payout.dto';

@ApiTags('Admin – Payouts')
@ApiBearerAuth('JWT-auth')
@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminPayoutController {
  constructor(private readonly adminPayoutService: AdminPayoutService) {}

  @Get('pending')
  @Permission(PERMISSIONS.BEAUTICIANS_PROCESS_PAYOUTS)
  @ApiOperation({ summary: 'List pending beautician payout requests' })
  async listPending() {
    const data = await this.adminPayoutService.listPending();
    return {
      success: true,
      message: 'Pending payout requests retrieved successfully',
      data,
    };
  }

  @Post('process')
  @Permission(PERMISSIONS.BEAUTICIANS_PROCESS_PAYOUTS)
  @ApiOperation({ summary: 'Process a beautician payout request' })
  async process(
    @GetUser('id') adminUserId: string,
    @Body() dto: ProcessPayoutDto,
  ) {
    const data = await this.adminPayoutService.processPayout(
      dto.payoutRequestId,
      adminUserId,
    );
    return {
      success: true,
      message: 'Payout processed successfully',
      data,
    };
  }
}