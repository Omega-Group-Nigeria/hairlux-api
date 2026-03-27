import {
  IsNotEmpty,
  IsUUID,
  IsDateString,
  IsOptional,
  IsString,
  IsEmail,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsEnum,
  ValidateIf,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingType, PaymentMethod } from '@prisma/client';

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
      'Booking type. HOME_SERVICE requires an addressId. WALK_IN is an in-store reservation — no address needed.',
    enum: BookingType,
    example: 'HOME_SERVICE',
  })
  @IsEnum(BookingType, {
    message: 'bookingType must be HOME_SERVICE or WALK_IN',
  })
  bookingType: BookingType;

  @ApiPropertyOptional({
    description:
      'Address ID from user saved addresses (required when bookingType is HOME_SERVICE; ignored for WALK_IN)',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @ValidateIf((o) => o.bookingType === BookingType.HOME_SERVICE)
  @IsNotEmpty({ message: 'addressId is required for HOME_SERVICE bookings' })
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    description:
      'Name of the person the booking is for (leave empty if booking for yourself)',
    example: 'Amara Okafor',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  guestName?: string;

  @ApiPropertyOptional({
    description: 'Phone number of the guest',
    example: '+2348012345678',
  })
  @IsOptional()
  @IsString()
  guestPhone?: string;

  @ApiProperty({
    description:
      'Payment method. WALLET deducts from your wallet balance immediately. CASH reserves the slot and payment is collected on delivery.',
    enum: PaymentMethod,
    example: 'WALLET',
  })
  @IsEnum(PaymentMethod, { message: 'paymentMethod must be WALLET or CASH' })
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description:
      'Optional discount code to apply at checkout. The code must be active and not expired.',
    example: 'JANE20',
  })
  @IsOptional()
  @IsString()
  discountCode?: string;

  @ApiPropertyOptional({
    description:
      'Email address of the guest this booking is for. If provided, a notification email with the reservation code will be sent to the guest after successful booking.',
    example: 'amara.okafor@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'guestEmail must be a valid email address' })
  guestEmail?: string;
}
