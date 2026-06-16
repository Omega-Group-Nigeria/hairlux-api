import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { QuoteShopOrderDto } from './quote-shop-order.dto';

export class CreateShopOrderDto extends QuoteShopOrderDto {
  @ApiProperty({
    description:
      'Client-generated idempotency key for retry-safe shop checkout',
    example: 'shop-8f19405c-84de-4863-aaf1-9913e4b52a35',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  idempotencyKey: string;
}