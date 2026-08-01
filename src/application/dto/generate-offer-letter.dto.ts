import { IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';
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

    @ApiProperty({ example: '2026-09-01' })
    @IsDateString()
    effectiveDate: string;

    @ApiPropertyOptional({ description: 'Which offer letter template was used' })
    @IsOptional()
    @IsString()
    templateUsed?: string;
}