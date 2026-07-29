import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveEmploymentDto {
    @ApiPropertyOptional({ description: 'Optional notes on the approval decision' })
    @IsOptional()
    @IsString()
    notes?: string;
}