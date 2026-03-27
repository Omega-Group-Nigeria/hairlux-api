import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class QueryInfluencersDto {
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
    example: 'Jane',
    description: 'Search by name, phone, or email (case-insensitive)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsString()
  search?: string;

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
