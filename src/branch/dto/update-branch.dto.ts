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
}