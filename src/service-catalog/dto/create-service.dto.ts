import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsUUID,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
};

export class CreateServiceDto {
  @ApiProperty({
    description: 'Category ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ description: 'Service name', example: 'Box Braids' })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({
    description: 'Service description',
    example: 'Beautiful long-lasting box braids styled to perfection',
  })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  description: string;

  @ApiProperty({ description: 'Walk-in service price in Naira', example: 25000 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  walkInPrice: number;

  @ApiProperty({
    description: 'Home service price in Naira',
    example: 30000,
  })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  homeServicePrice: number;

  @ApiProperty({
    description: 'Whether this service can be booked as WALK_IN',
    example: true,
    default: true,
  })
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isWalkInAvailable: boolean = true;

  @ApiProperty({
    description: 'Whether this service can be booked as HOME_SERVICE',
    example: true,
    default: true,
  })
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  @ValidateIf((o) => o.isWalkInAvailable === false || o.isHomeServiceAvailable !== undefined)
  isHomeServiceAvailable: boolean = true;

  @ApiProperty({ description: 'Service duration in minutes', example: 180 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  duration: number;
}
