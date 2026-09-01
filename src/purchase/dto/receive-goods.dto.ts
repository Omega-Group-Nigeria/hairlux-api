import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class GoodsReceiptLineDto {
    @ApiProperty()
    @IsString()
    purchaseLineId: string;

    @ApiProperty({ example: 70 })
    @Type(() => Number) @IsInt() @Min(1)
    deliveredQty: number;

    @ApiPropertyOptional({ default: 0 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(0)
    damagedQty?: number;

    @ApiProperty({ description: 'Quantity actually entering usable inventory -- not necessarily deliveredQty minus damagedQty, there may be other reasons for a gap' })
    @Type(() => Number) @IsInt() @Min(0)
    acceptedQty: number;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    batchLotNumber?: string;

    @ApiPropertyOptional()
    @IsOptional() @IsDateString()
    expiryDate?: string;
}

export class ReceiveGoodsDto {
    @ApiProperty({ type: [GoodsReceiptLineDto] })
    @IsArray() @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => GoodsReceiptLineDto)
    lines: GoodsReceiptLineDto[];
}