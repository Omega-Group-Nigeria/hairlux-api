import { IsOptional, IsString, IsNotEmpty, IsDateString, IsEnum, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceOverrideReason, AttendanceStatus } from '@prisma/client';

export class CorrectAttendanceDto {
    @ApiPropertyOptional({ description: 'Corrected check-in time (ISO 8601)' })
    @IsOptional()
    @IsDateString()
    checkInAt?: string;

    @ApiPropertyOptional({ description: 'Corrected check-out time (ISO 8601)' })
    @IsOptional()
    @IsDateString()
    checkOutAt?: string;

    @ApiPropertyOptional({ enum: AttendanceStatus })
    @IsOptional()
    @IsEnum(AttendanceStatus)
    status?: AttendanceStatus;

    @ApiProperty({ enum: AttendanceOverrideReason, description: 'Required — the category this override falls under' })
    @IsEnum(AttendanceOverrideReason)
    reasonCategory: AttendanceOverrideReason;

    @ApiProperty({ description: 'Required when reasonCategory is OTHER; optional supplementary detail otherwise' })
    @ValidateIf((o) => o.reasonCategory === AttendanceOverrideReason.OTHER || o.reason !== undefined)
    @IsString()
    @IsNotEmpty()
    reason?: string;
}