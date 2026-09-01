import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RequestCorrectionDto {
    @ApiPropertyOptional({ description: 'Why this period is being sent back for correction' })
    @IsOptional()
    @IsString()
    note?: string;
}