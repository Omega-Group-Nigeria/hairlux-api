import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

const SOURCES = ['ROLE', 'PAYROLL', 'SYSTEM'] as const;

export class QueryAuditTrailDto {
    @ApiPropertyOptional({ enum: SOURCES, description: 'Omit for all three sources merged together' })
    @IsOptional()
    @IsIn(SOURCES)
    source?: 'ROLE' | 'PAYROLL' | 'SYSTEM';

    @ApiPropertyOptional({ description: "e.g. 'DiscountCode', 'PayrollPeriod' -- see GET entity-types for the current live list. Doesn't apply to the ROLE source (see the service's own note)." })
    @IsOptional()
    @IsString()
    entityType?: string;

    @ApiPropertyOptional({ description: 'Staff or User id of who performed the action, depending on source' })
    @IsOptional()
    @IsUUID()
    actorId?: string;

    @ApiPropertyOptional({ description: 'ISO date string' })
    @IsOptional()
    @IsDateString()
    from?: string;

    @ApiPropertyOptional({ description: 'ISO date string' })
    @IsOptional()
    @IsDateString()
    to?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 50 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 50;
}