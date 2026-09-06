import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class AcceptGoodsLineDto {
    @ApiProperty()
    @IsString()
    goodsReceiptLineId: string;

    @ApiProperty({ description: 'Quantity actually entering usable inventory from this receipt line -- not necessarily deliveredQty minus damagedQty, there may be other reasons for a gap' })
    @Type(() => Number) @IsInt() @Min(0)
    acceptedQty: number;
}

export class AcceptGoodsDto {
    @ApiProperty({ type: [AcceptGoodsLineDto] })
    @IsArray() @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => AcceptGoodsLineDto)
    lines: AcceptGoodsLineDto[];
}