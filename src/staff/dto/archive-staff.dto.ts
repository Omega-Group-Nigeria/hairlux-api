import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ArchiveStaffDto {
  @ApiPropertyOptional({ example: 'Contract completed' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  reasonForExit?: string;

  @ApiPropertyOptional({ example: '2026-03-20' })
  @IsOptional()
  @IsDateString()
  exitDate?: string;
}
