import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
};

export class CreateDeliveryRegionDto {
  @ApiProperty({
    description: 'Display name for the region',
    example: 'Lagos',
  })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({
    description: 'State value matching Address.state',
    example: 'Lagos',
  })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  state: string;

  @ApiProperty({ description: 'Delivery fee in Naira', example: 2500 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  deliveryFee: number;

  @ApiPropertyOptional({
    description: 'Whether delivery is available for this region',
    example: true,
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isActive?: boolean = true;
}