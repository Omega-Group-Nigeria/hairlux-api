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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

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
}
