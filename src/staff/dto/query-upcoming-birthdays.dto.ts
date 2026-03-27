import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryUpcomingBirthdaysDto {
  @ApiPropertyOptional({
    description: 'Number of days ahead to include',
    example: 30,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 30))
  @IsInt()
  @Min(1)
  @Max(365)
  daysAhead?: number = 30;

  @ApiPropertyOptional({
    description: 'Include archived/exited staff',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return false;
  })
  @IsBoolean()
  includeFormer?: boolean = false;
}
