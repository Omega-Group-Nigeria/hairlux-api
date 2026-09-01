import { IsOptional, IsEnum, IsUUID, IsInt, Min, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { LeaveRequestStatus, LeaveRequestType } from '@prisma/client';

export class QueryLeaveRequestDto {
    @ApiPropertyOptional({ enum: LeaveRequestStatus })
    @IsOptional()
    @IsEnum(LeaveRequestStatus)
    status?: LeaveRequestStatus;

    @ApiPropertyOptional({ enum: LeaveRequestType })
    @IsOptional()
    @IsEnum(LeaveRequestType)
    type?: LeaveRequestType;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    staffId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    locationId?: string;

    @ApiPropertyOptional({ description: 'Report-style overlap filter -- returns requests whose own [startDate, endDate] range intersects [from, to], not requests merely SUBMITTED in that window.' })
    @IsOptional()
    @IsDateString()
    from?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    to?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 20;
}