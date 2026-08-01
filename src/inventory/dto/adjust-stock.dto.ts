import { IsInt, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdjustStockDto {
    @ApiProperty({ example: -3, description: 'Positive to add, negative to subtract' })
    @IsInt()
    quantityDelta: number;

    @ApiProperty({ description: 'Required — why this adjustment is being made' })
    @IsString()
    @IsNotEmpty()
    reason: string;
}