import {
  IsNotEmpty,
  IsUUID,
  IsDateString,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class ServiceBookingItemDto {
  @ApiProperty({
    description: 'Service ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsNotEmpty()
  @IsUUID()
  serviceId: string;

  @ApiPropertyOptional({
    description: 'Optional notes specific to this service',
    example: 'Please bring extension hair',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateBookingDto {
  @ApiProperty({
    description: 'One or more services to book in this appointment',
    type: [ServiceBookingItemDto],
    example: [
      { serviceId: '123e4567-e89b-12d3-a456-426614174001' },
      {
        serviceId: '123e4567-e89b-12d3-a456-426614174002',
        notes: 'Extra time needed',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ServiceBookingItemDto)
  services: ServiceBookingItemDto[];

  @ApiProperty({
    description: 'Booking date (YYYY-MM-DD)',
    example: '2026-02-15',
  })
  @IsNotEmpty()
  @IsDateString()
  date: string;

  @ApiProperty({
    description: 'Booking time (HH:MM)',
    example: '14:00',
  })
  @IsNotEmpty()
  @IsString()
  time: string;

  @ApiProperty({
    description:
      'Address ID from user saved addresses (must have latitude and longitude)',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsNotEmpty()
  @IsUUID()
  addressId: string;

  @ApiProperty({
    description:
      'Payment method. WALLET deducts from your wallet balance immediately. CASH reserves the slot and payment is collected on delivery.',
    enum: PaymentMethod,
    example: 'WALLET',
  })
  @IsEnum(PaymentMethod, { message: 'paymentMethod must be WALLET or CASH' })
  paymentMethod: PaymentMethod;
}
