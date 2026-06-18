import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateStaffLocationDto {
  @ApiPropertyOptional({ example: 'Ikoyi Branch' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => toTrimmedString(value))
  name?: string;

  @ApiPropertyOptional({
    example: '15 Admiralty Way, Lekki Phase 1, Lagos',
    description: 'Physical address for the location / branch',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(({ value }) => toTrimmedString(value))
  address?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
