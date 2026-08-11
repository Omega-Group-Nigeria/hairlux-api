import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ShopOrderLineItemDto } from './shop-order-line-item.dto';

export function hasTemporaryDeliveryLocation(input: {
  tempLatitude?: unknown;
  tempLongitude?: unknown;
  tempFullAddress?: unknown;
  tempState?: unknown;
}): boolean {
  if (
    input.tempLatitude === undefined ||
    input.tempLatitude === null ||
    input.tempLongitude === undefined ||
    input.tempLongitude === null
  ) {
    return false;
  }

  if (typeof input.tempFullAddress !== 'string') {
    return false;
  }

  return (
    input.tempFullAddress.trim().length > 0 &&
    typeof input.tempState === 'string' &&
    input.tempState.trim().length > 0
  );
}

export class QuoteShopOrderDto {
  @ApiPropertyOptional({
    description:
      'Saved delivery address ID. Required for delivery when the temporary location fields are not provided.',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @ValidateIf(
    (o: QuoteShopOrderDto) => !hasTemporaryDeliveryLocation(o),
  )
  @IsNotEmpty({
    message:
      'addressId or temporary location (tempLatitude, tempLongitude, tempFullAddress, tempState) is required for delivery',
  })
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    description:
      'Temporary delivery latitude (current location). Use with tempLongitude + tempFullAddress + tempState instead of addressId.',
    example: 6.524379,
  })
  @ValidateIf(
    (o: QuoteShopOrderDto) => !o.addressId,
  )
  @IsNotEmpty({
    message:
      'tempLatitude is required when addressId is omitted for delivery',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  tempLatitude?: number;

  @ApiPropertyOptional({
    description:
      'Temporary delivery longitude (current location). Use with tempLatitude + tempFullAddress + tempState instead of addressId.',
    example: 3.379206,
  })
  @ValidateIf(
    (o: QuoteShopOrderDto) => !o.addressId,
  )
  @IsNotEmpty({
    message:
      'tempLongitude is required when addressId is omitted for delivery',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  tempLongitude?: number;

  @ApiPropertyOptional({
    description:
      'Human-readable temporary delivery address (current location). Use with tempLatitude + tempLongitude + tempState instead of addressId.',
    example: '12 Admiralty Way, Lekki Phase 1, Lagos',
  })
  @ValidateIf(
    (o: QuoteShopOrderDto) => !o.addressId,
  )
  @IsNotEmpty({
    message:
      'tempFullAddress is required when addressId is omitted for delivery',
  })
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  tempFullAddress?: string;

  @ApiPropertyOptional({
    description:
      'State portion of the temporary delivery location, used to price the delivery fee. Required with the other temporary location fields.',
    example: 'Lagos',
  })
  @ValidateIf(
    (o: QuoteShopOrderDto) => !o.addressId,
  )
  @IsNotEmpty({
    message: 'tempState is required when addressId is omitted for delivery',
  })
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  tempState?: string;

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