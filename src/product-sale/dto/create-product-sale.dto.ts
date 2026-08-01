import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class ProductSaleLineDto {
    @ApiProperty()
    @IsUUID()
    itemId: string;

    @ApiProperty({ example: 2 })
    @IsInt()
    @Min(1)
    quantity: number;
}

export class CreateProductSaleDto {
    @ApiPropertyOptional({ description: 'Required for Admin-created sales; auto-set to the caller\'s own branch for staff-created ones.' })
    @IsOptional()
    @IsUUID()
    branchId?: string;

    @ApiProperty({ type: [ProductSaleLineDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ProductSaleLineDto)
    items: ProductSaleLineDto[];

    @ApiPropertyOptional({ example: 'Ngozi Adeyemi' })
    @IsOptional()
    @IsString()
    customerName?: string;

    @ApiPropertyOptional({ example: '+2348012345678' })
    @IsOptional()
    @IsString()
    customerPhone?: string;
}