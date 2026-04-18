import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingType } from '@prisma/client';
import { ServiceBookingItemDto } from './create-booking.dto';

export class BookingPaymentPayloadDto {
  @ApiProperty({
    description: 'One or more services to book in this appointment',
    type: [ServiceBookingItemDto],
    example: [{ serviceId: '123e4567-e89b-12d3-a456-426614174001' }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ServiceBookingItemDto)
  services: ServiceBookingItemDto[];

  @ApiProperty({
    description: 'Booking date (YYYY-MM-DD)',
    example: '2026-05-01',
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
    description: 'Booking type',
    enum: BookingType,
    example: 'HOME_SERVICE',
  })
  @IsEnum(BookingType, {
    message: 'bookingType must be HOME_SERVICE or WALK_IN',
  })
  bookingType: BookingType;

  @ApiPropertyOptional({
    description:
      'Address ID from saved addresses (required for HOME_SERVICE)',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @ValidateIf((o) => o.bookingType === BookingType.HOME_SERVICE)
  @IsNotEmpty({ message: 'addressId is required for HOME_SERVICE bookings' })
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    description: 'Name of the person the booking is for',
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

  @ApiPropertyOptional({
    description: 'Guest email address',
    example: 'amara.okafor@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'guestEmail must be a valid email address' })
  guestEmail?: string;

  @ApiPropertyOptional({
    description: 'Optional discount code to apply at checkout',
    example: 'JANE20',
  })
  @IsOptional()
  @IsString()
  discountCode?: string;
}
