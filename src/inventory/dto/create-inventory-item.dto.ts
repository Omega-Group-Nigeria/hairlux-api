import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, IsDateString, ValidateIf, IsNumber, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryCategory } from '@prisma/client';

export class CreateInventoryItemDto {
    @ApiProperty({ example: 'Shampoo — Argan Oil 500ml' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ enum: InventoryCategory, description: 'FOR_SALE items are sellable to customers and require a price; INTERNAL_USE and STORAGE items are not sellable.' })
    @IsEnum(InventoryCategory)
    category: InventoryCategory;

    @ApiPropertyOptional({ description: 'Which supplier/vendor this item is sourced from' })
    @IsOptional()
    @IsUUID()
    supplierId?: string;

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

    @ApiPropertyOptional({ example: 3500, description: 'Required when category is FOR_SALE — the price charged to a customer for this item.' })
    @ValidateIf((o) => o.category === 'FOR_SALE')
    @IsNumber()
    @Min(0)
    price?: number;
}