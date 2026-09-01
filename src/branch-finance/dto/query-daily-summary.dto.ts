import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class QueryDailySummaryDto {
    @ApiPropertyOptional({ description: 'Required for SUPER_ADMIN/ADMIN — non-admin roles are locked to their own branch regardless of what is sent here.' })
    @IsOptional()
    @IsUUID()
    branchId?: string;

    @ApiPropertyOptional({ example: '2026-08-01', description: 'Defaults to today (WAT) if omitted.' })
    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2026-08-07', description: 'Defaults to dateFrom if omitted — a single-day summary.' })
    @IsOptional()
    @IsDateString()
    dateTo?: string;
}