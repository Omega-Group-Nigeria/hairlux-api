import {
  IsDateString,
  IsNotEmpty,
  IsString,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RescheduleBookingDto {
  @ApiProperty({
    description: 'New booking date (YYYY-MM-DD)',
    example: '2026-02-20',
  })
  @IsNotEmpty()
  @IsDateString()
  date: string;

  @ApiProperty({
    description: 'New booking time (HH:MM)',
    example: '15:00',
  })
  @IsNotEmpty()
  @IsString()
  time: string;

  @ApiPropertyOptional({
    description: 'Reason for rescheduling',
    example: 'Personal emergency',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
