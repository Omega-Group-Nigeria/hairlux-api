import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class TransferStockBetweenTypesDto {
    @ApiProperty({ enum: StockType, description: 'Bucket to move quantity out of' })
    @IsEnum(StockType)
    fromStockType: StockType;

    @ApiProperty({ enum: StockType, description: 'Bucket to move quantity into' })
    @IsEnum(StockType)
    toStockType: StockType;

    @ApiProperty({ example: 5, description: 'How much to move — must not exceed what is available in fromStockType' })
    @IsInt()
    @Min(1)
    quantity: number;

    @ApiPropertyOptional({ description: 'Optional free-text note on why this reallocation was made.' })
    @IsOptional()
    @IsString()
    reason?: string;
}