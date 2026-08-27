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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

// Matches CustomerLifecycle exactly (src/common/utils/customer-status.util.ts) -- same literal-array approach used elsewhere in this codebase (e.g. UpsertLifecycleCampaignTemplateDto).
const LIFECYCLE_VALUES = ['NEVER_VISITED', 'NEW', 'ACTIVE', 'AT_RISK', 'DORMANT', 'INACTIVE'] as const;
const VALUE_TIER_VALUES = ['STANDARD', 'PREMIUM', 'VIP'] as const;

export class CreateDiscountDto {
  @ApiProperty({
    description:
      'The discount code (alphanumeric + hyphens, converted to uppercase)',
    example: 'SUMMER20',
  })
  @Transform(({ value }) => value?.trim().toUpperCase())
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9\-]{3,20}$/, {
    message:
      'Code must be 3-20 characters: uppercase letters, numbers, and hyphens only',
  })
  code: string;

  @ApiProperty({
    description: 'Display name for the discount',
    example: 'Summer Sale',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Discount percentage (1–100)',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsNumber()
  @Min(1)
  @Max(100)
  percentage: number;

  @ApiPropertyOptional({
    description: 'Whether the code is active (default: true)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({
    description:
      'Start date/time — code is inactive before this moment (ISO 8601). null = active immediately',
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'Expiry date — null means it never expires (ISO 8601)',
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description:
      'Maximum number of times this code can be used — null means unlimited',
    example: 100,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  // ── Dev Feedback Round 4, item #10: targeting ──
  // Every dimension below defaults to "no restriction" when omitted -- a
  // coupon with none of these set behaves exactly as before this feature.
  // Multiple set dimensions combine with AND (narrows the audience further).

  @ApiPropertyOptional({
    description: 'Restrict to one or more branches. Omit or empty for all branches.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  targetBranchIds?: string[];

  @ApiPropertyOptional({
    description: 'Restrict to one or more customer lifecycle stages. Omit or empty for all stages.',
    enum: LIFECYCLE_VALUES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(LIFECYCLE_VALUES, { each: true })
  targetLifecycleStages?: string[];

  @ApiPropertyOptional({
    description: 'Restrict to one or more customer value tiers. Omit or empty for all tiers.',
    enum: VALUE_TIER_VALUES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VALUE_TIER_VALUES, { each: true })
  targetValueTiers?: string[];

  @ApiPropertyOptional({
    description: 'Restrict to customers who actually received this specific lifecycle campaign template (a SENT record must exist for them). Mutually meaningful alongside targetCampaignSequenceId, but typically only one is set.',
  })
  @IsOptional()
  @IsUUID()
  targetCampaignTemplateId?: string;

  @ApiPropertyOptional({
    description: 'Restrict to customers who actually received this specific lifecycle campaign sequence (a SENT record for any of its steps must exist for them).',
  })
  @IsOptional()
  @IsUUID()
  targetCampaignSequenceId?: string;
}