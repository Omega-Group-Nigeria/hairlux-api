import { IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateOfferLetterDto {
    @ApiProperty({ example: 120000, description: 'Negotiated base salary (NGN) — overrides the posting\'s advertised range' })
    @IsNumber()
    @Min(0)
    baseSalary: number;

    @ApiPropertyOptional({ example: 15000 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    allowances?: number;

    @ApiPropertyOptional({ description: 'Free-text note, e.g. "includes commission on completed bookings"' })
    @IsOptional()
    @IsString()
    compensationNote?: string;

    @ApiProperty({ example: '2026-09-01', description: 'Plain calendar date (YYYY-MM-DD) — no time component or timezone offset needed' })
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveDate must be a date in YYYY-MM-DD format' })
    effectiveDate: string;

    @ApiPropertyOptional({ description: 'Which offer letter template was used' })
    @IsOptional()
    @IsString()
    templateUsed?: string;
}