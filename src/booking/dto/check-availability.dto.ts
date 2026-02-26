import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CheckAvailabilityDto {
  @ApiPropertyOptional({
    description: 'Service ID to check availability for',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({
    description: 'Date to check availability (YYYY-MM-DD)',
    example: '2026-02-15',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
