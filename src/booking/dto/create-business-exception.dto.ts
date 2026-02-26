import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBusinessExceptionDto {
  @ApiProperty({
    description: 'The specific calendar date for this exception (YYYY-MM-DD)',
    example: '2026-12-25',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: 'Whether the business is closed on this date',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean = true;

  @ApiPropertyOptional({
    description: 'Override open time (only relevant when isClosed is false)',
    example: '10:00',
  })
  @ValidateIf((o) => o.isClosed === false)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'openTime must be a valid time in HH:mm format (e.g. 10:00)',
  })
  openTime?: string;

  @ApiPropertyOptional({
    description: 'Override close time (only relevant when isClosed is false)',
    example: '14:00',
  })
  @ValidateIf((o) => o.isClosed === false)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'closeTime must be a valid time in HH:mm format (e.g. 14:00)',
  })
  closeTime?: string;

  @ApiPropertyOptional({
    description: 'Reason for the exception',
    example: 'Christmas Holiday',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
