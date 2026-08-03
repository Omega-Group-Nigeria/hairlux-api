import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SetCompensationDto {
    @ApiProperty({ example: 150000 })
    @IsNumber()
    @Min(0)
    baseSalary: number;

    @ApiPropertyOptional({ example: 20000 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    allowances?: number;

    @ApiPropertyOptional({ example: 'Annual review — 10% increase' })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiProperty({ example: '2026-09-01' })
    @IsDateString()
    effectiveDate: string;
}