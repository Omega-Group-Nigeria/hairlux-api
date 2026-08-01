import { IsEnum, IsDateString, IsString, IsNotEmpty, IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveRequestType } from '@prisma/client';

const PERMISSION_TYPES = [
    LeaveRequestType.PERMISSION_LATE_ARRIVAL,
    LeaveRequestType.PERMISSION_EARLY_DEPARTURE,
];

export class CreateLeaveRequestDto {
    @ApiProperty({ enum: LeaveRequestType })
    @IsEnum(LeaveRequestType)
    type: LeaveRequestType;

    @ApiProperty({ example: '2026-08-10' })
    @IsDateString()
    startDate: string;

    @ApiProperty({ example: '2026-08-10', description: 'Same as startDate for single-day requests' })
    @IsDateString()
    endDate: string;

    @ApiPropertyOptional({ example: '14:00', description: 'Required for PERMISSION_LATE_ARRIVAL / PERMISSION_EARLY_DEPARTURE' })
    @ValidateIf((o) => PERMISSION_TYPES.includes(o.type))
    @IsString()
    startTime?: string;

    @ApiPropertyOptional({ example: '16:00' })
    @ValidateIf((o) => PERMISSION_TYPES.includes(o.type))
    @IsString()
    endTime?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    reason: string;
}