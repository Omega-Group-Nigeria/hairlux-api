import {
  IsArray,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingType } from '@prisma/client';
import {
  requiresHomeServiceAddress,
  ServiceBookingItemDto,
} from './create-booking.dto';

const SERVICE_MODE_VALUES = [BookingType.HOME_SERVICE, BookingType.WALK_IN];

export class BookingPaymentPayloadDto {
  @ApiProperty({
    description: 'One or more services to book in this appointment',
    type: [ServiceBookingItemDto],
    example: [
      {
        serviceId: '123e4567-e89b-12d3-a456-426614174001',
        serviceMode: 'WALK_IN',
      },
      {
        serviceId: '123e4567-e89b-12d3-a456-426614174002',
        serviceMode: 'HOME_SERVICE',
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

  @ApiPropertyOptional({
    description:
      'Legacy fallback for older clients. New clients should send serviceMode per services item.',
    enum: [BookingType.HOME_SERVICE, BookingType.WALK_IN],
    example: 'WALK_IN',
    deprecated: true,
  })
  @IsOptional()
  @IsIn(SERVICE_MODE_VALUES, {
    message: 'bookingType must be HOME_SERVICE or WALK_IN',
  })
  bookingType?: BookingType;

  @ApiPropertyOptional({
    description:
      'Address ID from saved addresses (required if any service has serviceMode HOME_SERVICE)',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @ValidateIf((o: BookingPaymentPayloadDto) =>
    requiresHomeServiceAddress(o.services, o.bookingType),
  )
  @IsNotEmpty({
    message:
      'addressId is required when any serviceMode is HOME_SERVICE (or legacy bookingType is HOME_SERVICE)',
  })
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
