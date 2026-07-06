import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
import { AdminQueryPayoutsDto } from './dto/admin-query-payouts.dto';
import { ProcessPayoutDto } from './dto/process-payout.dto';
import { ApprovePayoutTransferDto } from './dto/approve-payout-transfer.dto';

@ApiTags('Admin – Payouts')
@ApiBearerAuth('JWT-auth')
@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminPayoutController {
  constructor(private readonly adminPayoutService: AdminPayoutService) {}

  @Get()
  @Permission(PERMISSIONS.BEAUTICIANS_PROCESS_PAYOUTS)
  @ApiOperation({
    summary: 'List beautician payout requests',
    description:
      'Returns paginated payout requests. Omit status to list all; pass status=PENDING for the processing queue.',
  })
  async listPayouts(@Query() query: AdminQueryPayoutsDto) {
    const data = await this.adminPayoutService.listPayouts(query);
    return {
      success: true,
      message: 'Payout requests retrieved successfully',
      data,
    };
  }

  @Get('awaiting-approval')
  @Permission(PERMISSIONS.BEAUTICIANS_PROCESS_PAYOUTS)
  @ApiOperation({
    summary: 'List payouts with Paystack transfers awaiting approval',
  })
  async listAwaitingApproval() {
    const data = await this.adminPayoutService.listAwaitingApproval();
    return {
      success: true,
      message: 'Payouts awaiting transfer approval retrieved successfully',
      data,
    };
  }

  @Post('process')
  @Permission(PERMISSIONS.BEAUTICIANS_PROCESS_PAYOUTS)
  @ApiOperation({
    summary: 'Initiate Paystack transfer for a pending payout request',
  })
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
      message: data.requiresApproval
        ? 'Payout transfer initiated and awaiting Paystack approval'
        : 'Payout processed successfully',
      data,
    };
  }

  @Post('approve-transfer')
  @Permission(PERMISSIONS.BEAUTICIANS_PROCESS_PAYOUTS)
  @ApiOperation({
    summary: 'Approve or finalize a pending Paystack payout transfer',
  })
  async approveTransfer(
    @GetUser('id') adminUserId: string,
    @Body() dto: ApprovePayoutTransferDto,
  ) {
    const data = await this.adminPayoutService.approveTransfer(
      dto.payoutRequestId,
      adminUserId,
      dto.otp,
    );
    return {
      success: true,
      message: data.requiresApproval
        ? 'Transfer still awaiting Paystack approval'
        : 'Payout transfer approved successfully',
      data,
    };
  }
}