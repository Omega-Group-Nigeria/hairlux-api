import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toUpperTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class UpdateStaffLocationDto {
  @ApiPropertyOptional({ example: 'Ikoyi Branch' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => toTrimmedString(value))
  name?: string;

  @ApiPropertyOptional({
    example: 'IKY',
    description:
      'Short branch code used in staff IDs. 2-5 uppercase letters. ' +
      'Changing this does NOT retroactively rename existing staff codes at ' +
      'this branch — it only affects staff hired after the change. Rename ' +
      'existing codes deliberately via a separate migration if needed.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2,5}$/, {
    message: 'code must be 2-5 uppercase letters (e.g. LEK, IFE, ABJ)',
  })
  @Transform(({ value }) => toUpperTrimmedString(value))
  code?: string;

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