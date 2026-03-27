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

export class QueryDiscountsDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const rawValue = obj && obj[key] !== undefined ? obj[key] : value;
    const val = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    return val ? parseInt(val, 10) : 1;
  })
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
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
    description: 'Filter by active status',
    example: true,
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

  @ApiPropertyOptional({
    description: 'Search by code or name',
    example: 'SUMMER',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  search?: string;
}
