import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DecideExtraWorkDayDto {
    @ApiPropertyOptional({ description: 'Required when rejecting; optional note when approving.' })
    @IsOptional()
    @IsString()
    note?: string;
}