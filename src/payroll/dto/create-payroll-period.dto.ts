import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString } from 'class-validator';

export class CreatePayrollPeriodDto {
    @ApiProperty({ example: 'August 2026' })
    @IsString()
    label: string;

    @ApiProperty({ example: '2026-08-01' })
    @IsDateString()
    periodStart: string;

    @ApiProperty({ example: '2026-08-31' })
    @IsDateString()
    periodEnd: string;
}