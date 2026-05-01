import {
  IsString,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  ValidateIf,
  IsUUID,
  Matches,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingType, PaymentMethod } from '@prisma/client';
import { ServiceBookingItemDto } from './create-booking.dto';

export class AdminCreateBookingDto {
  @ApiProperty({
    description: 'User ID for the booking',
    example: 'clx1234567890',
  })
  @IsString()
  userId: string;

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
    description:
      'Booking type. HOME_SERVICE requires an addressId; WALK_IN does not.',
    enum: BookingType,
    example: 'WALK_IN',
  })
  @IsEnum(BookingType)
  bookingType: BookingType;

  @ApiPropertyOptional({
    description: 'Address ID — required when bookingType is HOME_SERVICE',
    example: 'clx1112223334',
  })
  @ValidateIf((o) => o.bookingType === BookingType.HOME_SERVICE)
  @IsString()
  addressId?: string;

  @ApiPropertyOptional({
    description:
      'Name of the guest the booking is for (leave empty if booking for user themselves)',
    example: 'Amara Okafor',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  guestName?: string;

  @ApiPropertyOptional({
    description: 'Guest phone number (Nigerian format)',
    example: '+2348012345678',
  })
  @IsOptional()
  @IsString()
  guestPhone?: string;

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
    description: 'Payment method',
    enum: ['WALLET', 'CASH'],
    example: 'CASH',
  })
  @IsOptional()
  @IsIn(['WALLET', 'CASH'])
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Walk-in customer, paid in cash',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Optional idempotency key for retry-safe admin booking creation',
    example: 'admin-book-8f19405c-84de-4863-aaf1-9913e4b52a35',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  idempotencyKey?: string;
}
