import {
  IsBoolean,
  IsDateString,
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

export class CreateInfluencerDiscountDto {
  @ApiPropertyOptional({
    description: 'UUID of the Influencer record to assign this code to',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsOptional()
  @IsUUID()
  influencerId?: string;

  @ApiPropertyOptional({
    description: 'Alias for influencerId — either field is accepted',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsOptional()
  @IsUUID()
  influencerUserId?: string;

  @ApiProperty({
    description: 'The discount code (alphanumeric + hyphens, auto-uppercased)',
    example: 'JANE20',
  })
  @Transform(({ value }) => value?.trim().toUpperCase())
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9\-]{3,20}$/, {
    message:
      'Code must be 3-20 characters: uppercase letters, numbers, and hyphens only',
  })
  code: string;

  @ApiPropertyOptional({
    description: 'Display name for the discount (auto-generated if omitted)',
    example: "Jane's 20% Off",
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Discount percentage (1-100)',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsNumber()
  @Min(1)
  @Max(100)
  percentage: number;

  @ApiPropertyOptional({
    description: 'Whether the code is active immediately (default: true)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({
    description: 'Start date — null = active immediately (ISO 8601)',
    example: '2026-03-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'Expiry date — null = never expires (ISO 8601)',
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of uses — null = unlimited',
    example: 500,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;
}
