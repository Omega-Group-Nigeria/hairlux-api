import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryCategory } from '@prisma/client';

class BulkCreateBranchEntry {
    @ApiProperty()
    @IsUUID()
    branchId: string;

    @ApiPropertyOptional({ example: 0, default: 0, description: 'Initial stock for this specific branch — independent per branch, not shared across the selection.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    initialQuantity?: number;
}

/**
 * Same item fields as CreateInventoryItemDto, but branchId/initialQuantity
 * are replaced with a per-branch array — one InventoryItem row gets
 * created per entry, each with its own starting quantity, since
 * InventoryItem is branch-scoped and there is no single shared-across-
 * branches row to point multiple branches at.
 */
export class BulkCreateInventoryItemDto {
    @ApiProperty({ example: 'Shampoo — Argan Oil 500ml' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ enum: InventoryCategory })
    @IsEnum(InventoryCategory)
    category: InventoryCategory;

    @ApiPropertyOptional()
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

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    expiryDate?: string;

    @ApiPropertyOptional({ example: 3500, description: 'Required when category is FOR_SALE.' })
    @ValidateIf((o) => o.category === 'FOR_SALE')
    @IsNumber()
    @Min(0)
    price?: number;

    @ApiProperty({ type: [BulkCreateBranchEntry], description: 'One entry per branch to create this item at — "select all branches" on the frontend just means populating this with every branch.' })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => BulkCreateBranchEntry)
    branches: BulkCreateBranchEntry[];
}