import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, IsDateString, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryCategory } from '@prisma/client';

export class UpdateInventoryItemDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    name?: string;

    @ApiPropertyOptional({ enum: InventoryCategory, description: 'Changing to FOR_SALE requires a price (either already set or provided in this same request).' })
    @IsOptional()
    @IsEnum(InventoryCategory)
    category?: InventoryCategory;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    unit?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(0)
    lowStockThreshold?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    expiryDate?: string;

    @ApiPropertyOptional({ description: 'The price charged to a customer for this item — only meaningful for FOR_SALE items.' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    price?: number;
}