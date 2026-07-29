import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform,Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  IsNumber,
  Min,
  Max,
  IsInt
} from 'class-validator';

export class UpdateBranchDto {
  @ApiPropertyOptional({ example: 'Ikoyi Branch' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({
    example: 'IKY',
    description:
      'Short branch code used in staff IDs. 2-5 uppercase letters. Changing ' +
      'this does NOT retroactively rename existing staff codes at this branch.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2,5}$/, {
    message: 'code must be 2-5 uppercase letters (e.g. LEK, IFE, ABJ)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code?: string;

  @ApiPropertyOptional({
    example: '15 Admiralty Way, Lekki Phase 1, Lagos',
    description: 'Physical address shown in branch picker and detail',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Open (true) or closed (false) to customers',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;


  @ApiPropertyOptional({ example: 6.4531 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  gpsLat?: number;

  @ApiPropertyOptional({ example: 3.4692 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  gpsLng?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  approvedRadiusMeters?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lateGracePeriodMinutes?: number;
}