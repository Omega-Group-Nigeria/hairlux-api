import { IsOptional, IsString, IsNotEmpty, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';

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

    @ApiProperty({ description: 'Required — why this record is being manually corrected' })
    @IsString()
    @IsNotEmpty()
    reason: string;
}