import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const STATUS_VALUES = [
    'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED',
    'INTERVIEW_COMPLETED', 'OFFER_EXTENDED', 'EMPLOYED', 'NOT_SELECTED',
] as const;

export class QueryRecruitmentReportDto {
    @ApiPropertyOptional({ example: '2026-01-01', description: 'Filters on application createdAt (submission date)' })
    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2026-12-31' })
    @IsOptional()
    @IsDateString()
    dateTo?: string;

    @ApiPropertyOptional({ description: 'Exact match against Application.appliedRole' })
    @IsOptional()
    @IsString()
    appliedRole?: string;

    @ApiPropertyOptional({ enum: STATUS_VALUES })
    @IsOptional()
    @IsIn(STATUS_VALUES)
    status?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    preferredLocationId?: string;
}