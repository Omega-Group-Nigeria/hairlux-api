import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class QueryStaffLocationsDto {
  @ApiPropertyOptional({ example: 'lekki' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  search?: string;

  @ApiPropertyOptional({
    description: 'Include inactive locations',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return false;
  })
  @IsBoolean()
  includeInactive?: boolean = false;
}
