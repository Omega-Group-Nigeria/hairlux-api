import { IsEnum, IsInt, IsString, IsNotEmpty, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockType } from '@prisma/client';


export const STOCK_ADJUSTMENT_REASONS = [
    'DAMAGED', 'LOST', 'EXPIRED', 'FOUND', 'COUNTING_ERROR', 'OPENING_BALANCE', 'CORRECTION', 'OTHER',
] as const;
export type StockAdjustmentReasonValue = (typeof STOCK_ADJUSTMENT_REASONS)[number];

export class AdjustStockDto {
    @ApiProperty({ enum: StockType, description: 'Which of the three buckets this adjustment corrects' })
    @IsEnum(StockType)
    stockType: StockType;

    @ApiProperty({ example: -3, description: 'Positive to add, negative to subtract' })
    @IsInt()
    quantityDelta: number;

    @ApiProperty({ enum: STOCK_ADJUSTMENT_REASONS, description: 'Required — which category this adjustment falls under' })
    @IsEnum(STOCK_ADJUSTMENT_REASONS)
    reasonCategory: StockAdjustmentReasonValue;

    @ApiPropertyOptional({ description: 'Detail beyond the category. Optional for a specific category, but required when reasonCategory is OTHER, since that category alone carries no information.' })
    @ValidateIf((o) => o.reasonCategory === 'OTHER' || o.reason !== undefined)
    @IsNotEmpty()
    @IsString()
    reason?: string;
}