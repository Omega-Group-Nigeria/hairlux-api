import { IsOptional, IsEnum, IsUUID, IsInt, Min } from 'class-validator';
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