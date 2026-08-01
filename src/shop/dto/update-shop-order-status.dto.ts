import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShopOrderStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateShopOrderStatusDto {
  @ApiProperty({
    description: 'New order status',
    enum: ShopOrderStatus,
    example: 'PROCESSING',
  })
  @IsNotEmpty()
  @IsEnum(ShopOrderStatus)
  status: ShopOrderStatus;

  @ApiPropertyOptional({
    description: 'Optional admin notes (e.g. cancellation reason)',
    example: 'Customer requested cancellation',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  notes?: string;
}