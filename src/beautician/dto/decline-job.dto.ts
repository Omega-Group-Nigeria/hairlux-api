import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DeclineJobDto {
  @ApiPropertyOptional({ example: 'Too far from current location' })
  @IsOptional()
  @IsString()
  reason?: string;
}