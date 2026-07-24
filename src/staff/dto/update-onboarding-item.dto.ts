import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOnboardingItemDto {
  @ApiProperty({
    example: true,
    description: 'Mark this checklist item complete (true) or reopen it (false)',
  })
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isComplete: boolean;

  @ApiPropertyOptional({
    example: 'Guarantor form received and verified by phone on 22 Jul.',
    description: 'Optional note explaining the status change',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  notes?: string;
}