import { IsEnum, IsInt, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StockType } from '@prisma/client';

export class AdjustStockDto {
    @ApiProperty({ enum: StockType, description: 'Which of the three buckets this adjustment corrects' })
    @IsEnum(StockType)
    stockType: StockType;

    @ApiProperty({ example: -3, description: 'Positive to add, negative to subtract' })
    @IsInt()
    quantityDelta: number;

    @ApiProperty({ description: 'Required — why this adjustment is being made' })
    @IsString()
    @IsNotEmpty()
    reason: string;
}