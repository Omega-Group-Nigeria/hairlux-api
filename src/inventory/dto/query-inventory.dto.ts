import { IsOptional, IsEnum, IsUUID, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { InventoryCategory } from '@prisma/client';

export class QueryInventoryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    branchId?: string;

    @ApiPropertyOptional({ enum: InventoryCategory })
    @IsOptional()
    @IsEnum(InventoryCategory)
    category?: InventoryCategory;

    @ApiPropertyOptional({ description: 'Only items at or below their low-stock threshold' })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    lowStockOnly?: boolean;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 20;
}