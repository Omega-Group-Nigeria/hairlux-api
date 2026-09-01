import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const LIFECYCLE_VALUES = ['NEVER_VISITED', 'NEW', 'ACTIVE', 'AT_RISK', 'DORMANT', 'INACTIVE'] as const;
const VALUE_TIER_VALUES = ['STANDARD', 'PREMIUM', 'VIP'] as const;

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

  // ── Dev Feedback Round 4, item #10: targeting ──
  // Sending any of these REPLACES that dimension entirely -- send an
  // empty array to clear a previously-set restriction on that dimension.
  // Omit the field to leave that dimension untouched.

  @ApiPropertyOptional({ description: 'Full replacement of the branch restriction. Empty array = no restriction.', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  targetBranchIds?: string[];

  @ApiPropertyOptional({ description: 'Full replacement of the lifecycle-stage restriction. Empty array = no restriction.', enum: LIFECYCLE_VALUES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(LIFECYCLE_VALUES, { each: true })
  targetLifecycleStages?: string[];

  @ApiPropertyOptional({ description: 'Full replacement of the value-tier restriction. Empty array = no restriction.', enum: VALUE_TIER_VALUES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VALUE_TIER_VALUES, { each: true })
  targetValueTiers?: string[];

  @ApiPropertyOptional({ description: 'Gate to recipients of this template. Pass null to remove.', nullable: true })
  @IsOptional()
  @IsUUID()
  targetCampaignTemplateId?: string | null;

  @ApiPropertyOptional({ description: 'Gate to recipients of this sequence. Pass null to remove.', nullable: true })
  @IsOptional()
  @IsUUID()
  targetCampaignSequenceId?: string | null;
}