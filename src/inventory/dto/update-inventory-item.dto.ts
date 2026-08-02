import { ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryCategory } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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

    @ApiPropertyOptional({ description: 'Which supplier/vendor this item is sourced from. Send null to clear.', nullable: true })
    @IsOptional()
    @IsUUID()
    supplierId?: string;

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