import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateDiscountDto {
  @ApiPropertyOptional({
    description: 'The discount code (auto-uppercased)',
    example: 'EMEKA50',
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim().toUpperCase())
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9\-]{3,20}$/, {
    message:
      'Code must be 3-20 characters: uppercase letters, numbers, and hyphens only',
  })
  code?: string;

  @ApiPropertyOptional({
    description: 'Display name for the discount',
    example: 'Summer Sale 2026',
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Discount percentage (1–100)',
    example: 25,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  percentage?: number;

  @ApiPropertyOptional({
    description: 'Enable or disable the code',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Start date/time override — pass null to make active immediately (ISO 8601)',
    example: '2026-06-01T00:00:00.000Z',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional({
    description: 'New expiry date (ISO 8601) — pass null to remove expiry',
    example: '2027-01-01',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional({
    description: 'Max uses — pass null to make unlimited',
    example: 200,
    minimum: 1,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;
}
