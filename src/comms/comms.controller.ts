import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { COMMS_TOKEN_RATE_LIMIT } from './constants/comms-events.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CommsConfigService } from './services/comms-config.service';
import { CommsTokenService } from './services/comms-token.service';
import { CommsSessionService } from './services/comms-session.service';

@ApiTags('Comms')
@ApiBearerAuth('JWT-auth')
@Controller('comms')
@UseGuards(JwtAuthGuard)
export class CommsController {
  constructor(
    private readonly commsConfig: CommsConfigService,
    private readonly tokenService: CommsTokenService,
    private readonly sessionService: CommsSessionService,
  ) {}

  @Get('config')
  @ApiOperation({
    summary: 'Public Stream SDK config for mobile clients (no secrets)',
  })
  async getConfig() {
    if (!this.commsConfig.isConfigured()) {
      throw new ServiceUnavailableException(
        'Stream comms is not configured on this server',
      );
    }

    return {
      success: true,
      message: 'Comms config retrieved successfully',
      data: this.commsConfig.getPublicConfig(),
    };
  }

  @Post('token')
  @Throttle({ default: { limit: COMMS_TOKEN_RATE_LIMIT, ttl: 60000 } })
  @ApiOperation({
    summary: 'Mint a Stream user token for Chat and Video (logged-in user)',
  })
  async mintToken(@GetUser('id') userId: string) {
    if (!this.commsConfig.isConfigured()) {
      throw new ServiceUnavailableException(
        'Stream comms is not configured on this server',
      );
    }

    const data = {
      ...this.tokenService.mintForUser(userId),
      ...this.commsConfig.getPublicConfig(),
    };

    return {
      success: true,
      message: 'Stream token created successfully',
      data,
    };
  }

  @Get('bookings/:bookingId')
  @ApiOperation({
    summary: 'Get comms session for a booking (participants only)',
  })
  async getBookingComms(
    @GetUser('id') userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    const data = await this.sessionService.getBookingCommsForUser(
      bookingId,
      userId,
    );

    return {
      success: true,
      message: 'Booking comms retrieved successfully',
      data,
    };
  }
}