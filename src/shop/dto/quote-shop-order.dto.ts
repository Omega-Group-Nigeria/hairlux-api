import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ShopOrderLineItemDto } from './shop-order-line-item.dto';

export class QuoteShopOrderDto {
  @ApiProperty({
    description: 'Saved delivery address ID',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsUUID()
  addressId: string;

  @ApiProperty({
    description: 'Products and quantities to purchase',
    type: [ShopOrderLineItemDto],
    example: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 2 }],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShopOrderLineItemDto)
  items: ShopOrderLineItemDto[];
}