import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsUUID,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ServiceStatus } from '@prisma/client';

const toBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
};

export class UpdateServiceDto {
  @ApiPropertyOptional({
    description: 'Category ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Service name', example: 'Box Braids' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  name?: string;

  @ApiPropertyOptional({
    description: 'Service description',
    example: 'Beautiful long-lasting box braids styled to perfection',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({
    description: 'Walk-in service price in Naira',
    example: 25000,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  walkInPrice?: number;

  @ApiPropertyOptional({
    description: 'Home service price in Naira',
    example: 30000,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  homeServicePrice?: number;

  @ApiPropertyOptional({
    description: 'Whether this service can be booked as WALK_IN',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isWalkInAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'Whether this service can be booked as HOME_SERVICE',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isHomeServiceAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'Service duration in minutes',
    example: 180,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({
    description: 'Service status',
    enum: ServiceStatus,
    example: ServiceStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;
}
