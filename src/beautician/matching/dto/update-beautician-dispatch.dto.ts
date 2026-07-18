import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateBeauticianDispatchDto {
  @ApiProperty({
    description:
      'When true, beautician is excluded from dispatch matching and removed from geo index. When false, re-enables dispatch (cancels any timed probation).',
  })
  @IsBoolean()
  suspended: boolean;

  @ApiPropertyOptional({
    description:
      'ISO 8601 end of timed probation (must be in the future). Required for auto-unsuspend unless `durationHours` is set. Ignored when suspended=false.',
    example: '2026-07-25T12:00:00.000Z',
  })
  @ValidateIf((o: UpdateBeauticianDispatchDto) => o.suspended === true)
  @IsOptional()
  @IsDateString()
  until?: string;

  @ApiPropertyOptional({
    description:
      'Hours from now until auto-unsuspend (1–720). Alternative to `until`. Ignored when suspended=false.',
    example: 72,
    minimum: 1,
    maximum: 720,
  })
  @ValidateIf((o: UpdateBeauticianDispatchDto) => o.suspended === true)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  durationHours?: number;

  @ApiPropertyOptional({
    description:
      'Reason shared with the beautician in email (e.g. poor reviews, policy breach). Stored on the profile while suspended.',
    example: 'Multiple customer complaints this week. Dispatch paused for review.',
  })
  @ValidateIf((o: UpdateBeauticianDispatchDto) => o.suspended === true)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
