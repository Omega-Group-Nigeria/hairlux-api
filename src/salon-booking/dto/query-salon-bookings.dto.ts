import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID, IsString } from 'class-validator';
import { Type } from 'class-transformer';

const STATUS_VALUES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

export class QuerySalonBookingsDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    branchId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    assignedStaffId?: string;

    @ApiPropertyOptional({ enum: STATUS_VALUES })
    @IsOptional()
    @IsIn(STATUS_VALUES)
    status?: string;

    @ApiPropertyOptional({ example: '2026-08-01' })
    @IsOptional()
    @IsDateString()
    date?: string;

    @ApiPropertyOptional({ description: 'Matches customer name, customer phone, or Booking ID (accepts either the raw number or the HLB-prefixed display format)' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    page?: number;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    limit?: number;
}