import { IsString, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class AdminCreateBookingDto {
  @ApiProperty({
    description: 'User ID for the booking',
    example: 'clx1234567890',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'Service ID',
    example: 'clx9876543210',
  })
  @IsString()
  serviceId: string;

  @ApiProperty({
    description: 'Address ID for service delivery',
    example: 'clx1112223334',
  })
  @IsString()
  addressId: string;

  @ApiProperty({
    description: 'Booking date (YYYY-MM-DD)',
    example: '2026-02-20',
  })
  @IsDateString()
  bookingDate: string;

  @ApiProperty({
    description: 'Booking time slot (HH:MM format)',
    example: '10:00',
  })
  @IsString()
  bookingTime: string;

  @ApiPropertyOptional({
    description: 'Payment method for walk-in booking',
    enum: PaymentMethod,
    example: 'CASH',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Walk-in customer, paid in cash',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
