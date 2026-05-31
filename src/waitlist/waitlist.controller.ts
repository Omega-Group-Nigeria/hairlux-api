import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';
import { Public } from '../auth/decorators/public.decorator';
import { ResponseUtil } from '../common/utils/response.util';

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join the waitlist' })
  @ApiResponse({
    status: 201,
    description: 'Added to the waitlist successfully',
    example: {
      success: true,
      message: 'You have been added to the waitlist',
      data: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        createdAt: '2026-05-31T17:10:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Email is already on the waitlist' })
  async join(@Body() dto: CreateWaitlistEntryDto) {
    const data = await this.waitlistService.join(dto);
    return ResponseUtil.success(data, 'You have been added to the waitlist');
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all waitlist entries' })
  @ApiResponse({
    status: 200,
    description: 'Waitlist entries retrieved successfully',
    example: {
      success: true,
      message: 'Waitlist entries retrieved successfully',
      data: [
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          fullName: 'Jane Doe',
          email: 'jane.doe@example.com',
          createdAt: '2026-05-31T17:10:00.000Z',
        },
      ],
    },
  })
  async findAll() {
    const data = await this.waitlistService.findAll();
    return ResponseUtil.success(data, 'Waitlist entries retrieved successfully');
  }
}
