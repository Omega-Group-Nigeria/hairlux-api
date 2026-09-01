import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordPurchasePaymentDto {
    @ApiProperty()
    @Type(() => Number) @IsNumber() @Min(0.01)
    amount: number;

    @ApiProperty({ example: 'Bank Transfer' })
    @IsString()
    paymentMethod: string;

    @ApiProperty()
    @IsDateString()
    paymentDate: string;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    paymentReference?: string;
}