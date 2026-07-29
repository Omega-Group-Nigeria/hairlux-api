import { IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CloseJobPostingDto {
  @ApiPropertyOptional({
    description: 'Set true to force-close a listing that still has active candidates',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  override?: boolean = false;

  @ApiPropertyOptional({ description: 'Required when override is true' })
  @ValidateIf((o) => o.override === true)
  @IsString()
  reason?: string;
}