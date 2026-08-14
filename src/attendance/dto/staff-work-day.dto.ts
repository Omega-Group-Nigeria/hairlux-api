import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class StaffWorkDayDto {
    @ApiProperty({ description: '0=Sunday ... 6=Saturday', minimum: 0, maximum: 6 })
    @IsInt()
    @Min(0)
    @Max(6)
    dayOfWeek: number;

    @ApiProperty({ enum: ['WORKING', 'OFF', 'HALF_DAY'] })
    @IsIn(['WORKING', 'OFF', 'HALF_DAY'])
    dayType: 'WORKING' | 'OFF' | 'HALF_DAY';

    @ApiPropertyOptional({ example: '09:00', description: 'Required when dayType is WORKING or HALF_DAY' })
    @ValidateIf((o) => o.dayType !== 'OFF')
    @Matches(TIME_PATTERN, { message: 'resumeTime must be in HH:mm format' })
    resumeTime?: string;

    @ApiPropertyOptional({ example: '18:00', description: 'Required when dayType is WORKING or HALF_DAY' })
    @ValidateIf((o) => o.dayType !== 'OFF')
    @Matches(TIME_PATTERN, { message: 'closingTime must be in HH:mm format' })
    closingTime?: string;

    @ApiPropertyOptional({ description: 'e.g. "alternate Saturdays" — this dayType only applies every other week' })
    @IsOptional()
    @IsBoolean()
    alternatesBiweekly?: boolean;

    @ApiPropertyOptional({ description: '0 or 1 — which ISO-week parity dayType applies on. Required when alternatesBiweekly is true.' })
    @ValidateIf((o) => o.alternatesBiweekly === true)
    @IsInt()
    @Min(0)
    @Max(1)
    activeWeekParity?: number;

    @ApiPropertyOptional({ enum: ['WORKING', 'OFF', 'HALF_DAY'], description: 'What applies on the opposite parity weeks. Required when alternatesBiweekly is true.' })
    @ValidateIf((o) => o.alternatesBiweekly === true)
    @IsIn(['WORKING', 'OFF', 'HALF_DAY'])
    alternateDayType?: 'WORKING' | 'OFF' | 'HALF_DAY';
}