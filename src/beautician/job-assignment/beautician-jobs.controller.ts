import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { BeauticianRoleGuard } from '../guards/beautician-role.guard';
import { FullyVerifiedGuard } from '../guards/fully-verified.guard';
import { JobQueryService } from './services/job-query.service';
import { JobAcceptService } from './services/job-accept.service';
import { JobDeclineService } from './services/job-decline.service';
import { JobEnRouteService } from '../home-service-booking/services/job-en-route.service';
import { JobArrivedService } from '../home-service-booking/services/job-arrived.service';
import { ServiceCompletionService } from '../home-service-booking/services/service-completion.service';
import { ArrivalVerificationReadService } from '../arrival-verification/services/arrival-verification-read.service';
import { DeclineJobDto } from '../dto/decline-job.dto';
import { MarkArrivedDto } from '../dto/mark-arrived.dto';
import { CompleteServiceDto } from '../dto/complete-service.dto';

@ApiTags('Beauticians – Jobs')
@ApiBearerAuth('JWT-auth')
@Controller('beauticians/jobs')
@UseGuards(JwtAuthGuard, BeauticianRoleGuard, FullyVerifiedGuard)
export class BeauticianJobsController {
  constructor(
    private readonly jobQueryService: JobQueryService,
    private readonly jobAcceptService: JobAcceptService,
    private readonly jobDeclineService: JobDeclineService,
    private readonly jobEnRouteService: JobEnRouteService,
    private readonly jobArrivedService: JobArrivedService,
    private readonly serviceCompletionService: ServiceCompletionService,
    private readonly arrivalVerificationReadService: ArrivalVerificationReadService,
  ) {}

  @Get('available')
  @ApiOperation({ summary: 'List available home service job offers' })
  async listAvailable(@GetUser('id') userId: string) {
    const data = await this.jobQueryService.listAvailable(userId);
    return {
      success: true,
      message: 'Available jobs retrieved successfully',
      data,
    };
  }

  @Get('active')
  @ApiOperation({ summary: 'List active assigned jobs' })
  async listActive(@GetUser('id') userId: string) {
    const data = await this.jobQueryService.listActive(userId);
    return {
      success: true,
      message: 'Active jobs retrieved successfully',
      data,
    };
  }

  @Post(':bookingId/accept')
  @ApiOperation({ summary: 'Accept a job offer' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  async accept(
    @GetUser('id') userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    const data = await this.jobAcceptService.accept(bookingId, userId);
    return {
      success: true,
      message: 'Job accepted successfully',
      data,
    };
  }

  @Post(':bookingId/en-route')
  @ApiOperation({ summary: 'Mark job as en route' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  async markEnRoute(
    @GetUser('id') userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    const data = await this.jobEnRouteService.markEnRoute(bookingId, userId);
    return {
      success: true,
      message: 'Job marked as en route',
      data,
    };
  }

  @Post(':bookingId/arrived')
  @ApiOperation({ summary: 'Mark arrived and generate arrival verification' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  async markArrived(
    @GetUser('id') userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: MarkArrivedDto,
  ) {
    const data = await this.jobArrivedService.markArrived(bookingId, userId, {
      lat: dto.lat,
      lng: dto.lng,
    });
    return {
      success: true,
      message: data.message,
      data,
    };
  }

  @Post(':bookingId/complete-service')
  @ApiOperation({ summary: 'Mark home service as complete' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  async completeService(
    @GetUser('id') userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: CompleteServiceDto,
  ) {
    const data = await this.serviceCompletionService.completeService(
      bookingId,
      userId,
      dto.notes,
    );
    return {
      success: true,
      message: data.message,
      data,
    };
  }

  @Post(':bookingId/decline')
  @ApiOperation({ summary: 'Decline a job offer' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  async decline(
    @GetUser('id') userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: DeclineJobDto,
  ) {
    const data = await this.jobDeclineService.decline(
      bookingId,
      userId,
      dto.reason,
    );
    return {
      success: true,
      message: 'Job declined successfully',
      data,
    };
  }
}