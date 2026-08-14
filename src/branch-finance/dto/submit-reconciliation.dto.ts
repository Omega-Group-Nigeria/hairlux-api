import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class SubmitReconciliationDto {
    @ApiPropertyOptional({ description: 'Required for SUPER_ADMIN/ADMIN — non-admin roles submit for their own branch regardless of what is sent here.' })
    @IsOptional()
    @IsUUID()
    branchId?: string;

    @ApiProperty({ example: '2026-08-07' })
    @IsDateString()
    date: string;

    @ApiProperty({ description: 'The actual cash counted/deposited for this date.' })
    @IsNumber()
    @Min(0)
    cashCounted: number;

    @ApiPropertyOptional({ description: 'Explanation for a variance, or any other note for this reconciliation.' })
    @IsOptional()
    @IsString()
    notes?: string;
}