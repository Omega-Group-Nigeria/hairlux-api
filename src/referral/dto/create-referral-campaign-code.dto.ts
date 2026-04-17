import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReferralCampaignCodeDto {
  @ApiProperty({
    description: 'Campaign code users enter at signup',
    example: 'LAUNCH100',
  })
  @Transform(({ value }) => value?.trim().toUpperCase())
  @IsString()
  code: string;

  @ApiProperty({
    description: 'Internal campaign name for admin visibility',
    example: 'Launch Bonus Campaign',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Optional campaign description',
    example: 'Signup bonus for first 100 users',
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim() || undefined)
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Wallet bonus amount credited at signup',
    example: 1000,
    minimum: 0.01,
    maximum: 1000000,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  signupBonusAmount: number;

  @ApiPropertyOptional({
    description: 'Whether the code can currently be used',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Optional start time (ISO 8601). Before this time, code is invalid.',
    example: '2026-04-20T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'Optional expiry time (ISO 8601). After this time, code is invalid.',
    example: '2026-05-20T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of successful uses. Omit for unlimited.',
    example: 100,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;
}
