import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryCategory } from '@prisma/client';

export class CreateInventoryItemDto {
    @ApiProperty({ example: 'Shampoo — Argan Oil 500ml' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ enum: InventoryCategory })
    @IsEnum(InventoryCategory)
    category: InventoryCategory;

    @ApiPropertyOptional({ example: 'bottle' })
    @IsOptional()
    @IsString()
    unit?: string;

    @ApiPropertyOptional({ example: 5, default: 5 })
    @IsOptional()
    @IsInt()
    @Min(0)
    lowStockThreshold?: number;

    @ApiPropertyOptional({ example: 0, default: 0, description: 'Initial stock on hand' })
    @IsOptional()
    @IsInt()
    @Min(0)
    initialQuantity?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    expiryDate?: string;
}