import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class ServiceRecipeLineDto {
    @ApiProperty({ description: 'The InventoryProduct this service consumes' })
    @IsUUID()
    productId: string;

    @ApiProperty({ description: 'How many units this service consumes per completion', minimum: 1 })
    @IsInt()
    @Min(1)
    quantity: number;
}

export class SetServiceRecipeDto {
    @ApiProperty({
        type: [ServiceRecipeLineDto],
        description: 'The full recipe -- replaces whatever was previously configured. Send every line that should remain; an empty array clears the recipe entirely.',
    })
    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => ServiceRecipeLineDto)
    lines: ServiceRecipeLineDto[];
}