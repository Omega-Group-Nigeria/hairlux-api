import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { BeauticianRoleGuard } from '../guards/beautician-role.guard';
import { QoreidSessionService } from './services/qoreid-session.service';
import { KycStatusService } from './services/kyc-status.service';

@ApiTags('Beauticians – KYC')
@ApiBearerAuth('JWT-auth')
@Controller('beauticians/kyc')
@UseGuards(JwtAuthGuard, BeauticianRoleGuard)
export class KycController {
  constructor(
    private readonly qoreidSessionService: QoreidSessionService,
    private readonly kycStatusService: KycStatusService,
  ) {}

  @Post('initiate')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Create QoreID workflow session' })
  @ApiResponse({ status: 201, description: 'Session created successfully' })
  async initiate(@GetUser('id') userId: string) {
    const data = await this.qoreidSessionService.initiateSession(userId);
    return {
      success: true,
      message: 'KYC session initiated successfully',
      data,
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get current KYC status' })
  @ApiResponse({ status: 200, description: 'KYC status retrieved' })
  async getStatus(@GetUser('id') userId: string) {
    const data = await this.kycStatusService.getStatus(userId);
    return {
      success: true,
      message: 'KYC status retrieved successfully',
      data,
    };
  }
}