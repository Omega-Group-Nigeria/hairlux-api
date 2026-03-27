import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class QueryInfluencerDiscountsDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const rawValue = obj && obj[key] !== undefined ? obj[key] : value;
    const val = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    return val ? parseInt(val, 10) : 1;
  })
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const rawValue = obj && obj[key] !== undefined ? obj[key] : value;
    const val = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    return val ? parseInt(val, 10) : 20;
  })
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'JANE',
    description: 'Search by code or name (case-insensitive)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Filter by a specific Influencer record UUID',
  })
  @IsOptional()
  @IsUUID()
  influencerId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    example: true,
    description: 'Filter by active status',
  })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const rawValue = obj && obj[key] !== undefined ? obj[key] : value;
    const val = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  })
  @IsBoolean()
  isActive?: boolean;
}
