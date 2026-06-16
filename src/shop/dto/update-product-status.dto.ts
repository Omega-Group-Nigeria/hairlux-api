import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateProductStatusDto {
  @ApiProperty({
    description: 'Product status',
    enum: ProductStatus,
    example: 'ACTIVE',
  })
  @IsNotEmpty()
  @IsEnum(ProductStatus)
  status: ProductStatus;
}