import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BusinessHoursDayDto {
  @ApiProperty({
    description: 'Day of week (0=Sunday, 1=Monday, ..., 6=Saturday)',
    example: 1,
    minimum: 0,
    maximum: 6,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({
    description: 'Opening time in HH:mm format',
    example: '09:00',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'openTime must be a valid time in HH:mm format (e.g. 09:00)',
  })
  openTime: string;

  @ApiProperty({
    description: 'Closing time in HH:mm format',
    example: '17:00',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'closeTime must be a valid time in HH:mm format (e.g. 17:00)',
  })
  closeTime: string;

  @ApiPropertyOptional({
    description: 'Whether the business is open on this day',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean = true;
}

export class SetBusinessHoursDto {
  @ApiProperty({
    description:
      'Array of day schedules (can be partial — only days included will be updated)',
    type: [BusinessHoursDayDto],
    example: [
      { dayOfWeek: 0, openTime: '09:00', closeTime: '17:00', isOpen: true },
      { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isOpen: true },
      { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00', isOpen: true },
      { dayOfWeek: 3, openTime: '09:00', closeTime: '17:00', isOpen: true },
      { dayOfWeek: 4, openTime: '09:00', closeTime: '17:00', isOpen: true },
      { dayOfWeek: 5, openTime: '09:00', closeTime: '13:00', isOpen: true },
      { dayOfWeek: 6, openTime: '09:00', closeTime: '13:00', isOpen: false },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessHoursDayDto)
  hours: BusinessHoursDayDto[];
}
