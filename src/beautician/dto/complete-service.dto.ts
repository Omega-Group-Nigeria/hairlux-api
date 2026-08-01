import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteServiceDto {
  @ApiPropertyOptional({ example: 'Client loved the final look.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}