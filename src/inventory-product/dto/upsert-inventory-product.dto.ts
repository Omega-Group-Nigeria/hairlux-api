import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertInventoryProductDto {
    @ApiProperty({ example: 'Moisturizing Shampoo 500ml' })
    @IsString() @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ example: 'SHP-500-001' })
    @IsOptional() @IsString()
    sku?: string;

    @ApiPropertyOptional({ example: "L'Oreal" })
    @IsOptional() @IsString()
    brand?: string;

    @ApiProperty({ enum: InventoryCategory })
    @IsEnum(InventoryCategory)
    category: InventoryCategory;

    @ApiPropertyOptional({ description: 'Free text -- the spec does not define a fixed list', example: 'Hair Care' })
    @IsOptional() @IsString()
    productType?: string;

    @ApiPropertyOptional({ example: 'bottle' })
    @IsOptional() @IsString()
    unit?: string;

    @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    costPrice?: number;

    @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    sellingPrice?: number;

    @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    bulkSellingPrice?: number;

    @ApiPropertyOptional({ description: 'Minimum quantity to qualify for bulk price' })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1)
    minBulkQuantity?: number;

    @ApiPropertyOptional({ default: 5 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(0)
    lowStockThreshold?: number;

    @ApiPropertyOptional({ default: false })
    @IsOptional() @Type(() => Boolean) @IsBoolean()
    expiryTrackingEnabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    description?: string;

    @ApiPropertyOptional({ default: true })
    @IsOptional() @Type(() => Boolean) @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ type: [String], description: 'Vendor/Supplier IDs that supply this product' })
    @IsOptional() @IsArray() @IsString({ each: true })
    vendorIds?: string[];
}