import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : undefined;
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return undefined;
}

export class UpdateProductDto {
  @ApiPropertyOptional({
    description: 'Product category ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Product name', example: 'Hair Growth Oil' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  name?: string;

  @ApiPropertyOptional({
    description: 'Product description',
    example: 'Nourishing oil for healthy hair growth',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({ description: 'Unit price in Naira', example: 8500 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Stock quantity', example: 50 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    description:
      'Product image IDs to remove. Send as JSON array string in multipart form, e.g. ["uuid-1","uuid-2"].',
    example: '["123e4567-e89b-12d3-a456-426614174000"]',
  })
  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsUUID('4', { each: true })
  removeImageIds?: string[];
}