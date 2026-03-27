import { Controller, Get, Param, UseGuards, UnauthorizedException } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { DiscountService } from './discount.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Discounts')
@ApiBearerAuth('JWT-auth')
@Controller('discounts')
@UseGuards(JwtAuthGuard)
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Get('validate/:code')
  @ApiOperation({
    summary: 'Validate a discount code',
    description:
      'Check if a discount code is valid at checkout. Returns the percentage discount if valid. ' +
      'Rejects expired, disabled, or exhausted codes. Prevents influencers from using their own codes.',
  })
  @ApiParam({
    name: 'code',
    description: 'The discount code to validate (case-insensitive)',
    example: 'SUMMER20',
  })
  @ApiResponse({
    status: 200,
    description: 'Discount code is valid',
    example: {
      success: true,
      message: 'Discount code is valid',
      data: {
        id: 'uuid',
        code: 'SUMMER20',
        name: 'Summer Sale',
        percentage: 20,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Code is expired, inactive, or usage limit reached',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — Influencers cannot use their own codes' })
  @ApiResponse({ status: 404, description: 'Discount code not found' })
  async validate(@Param('code') code: string, @GetUser('id') userId: string) {
    const data = await this.discountService.validate(code, userId);
    return { success: true, message: 'Discount code is valid', data };
  }
}
