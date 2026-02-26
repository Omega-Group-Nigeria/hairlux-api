import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetBookingTrendsDto {
  @ApiProperty({
    description: 'Start date (YYYY-MM-DD)',
    example: '2026-02-01',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date (YYYY-MM-DD)',
    example: '2026-02-28',
  })
  @IsDateString()
  endDate: string;
}
