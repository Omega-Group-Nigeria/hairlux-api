import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetStatsDto {
  @ApiPropertyOptional({
    description:
      'Start date (YYYY-MM-DD). Omit both startDate and endDate to get all-time stats.',
    example: '2026-02-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'End date (YYYY-MM-DD). Omit both startDate and endDate to get all-time stats.',
    example: '2026-02-28',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
