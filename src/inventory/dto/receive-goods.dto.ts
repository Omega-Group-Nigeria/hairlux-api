import { IsInt, Min, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceiveGoodsDto {
    @ApiProperty({ example: 20 })
    @IsInt()
    @Min(1)
    quantity: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    note?: string;
}