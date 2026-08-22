import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PurchaseRequestLineDto {
    @ApiProperty()
    @IsString()
    productId: string;

    @ApiProperty({ example: 100 })
    @Type(() => Number) @IsInt() @Min(1)
    quantity: number;

    @ApiPropertyOptional({ description: 'Omit to auto-fill from the last approved purchase price for this product' })
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    estimatedPrice?: number;
}