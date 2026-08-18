import {
  IsArray,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
  ArrayMinSize,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingType } from '@prisma/client';
import {
  hasTemporaryServiceLocation,
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
      'Address ID from saved addresses. Required for HOME_SERVICE when temporary location fields are not provided.',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @ValidateIf(
    (o: BookingPaymentPayloadDto) =>
      requiresHomeServiceAddress(o.services, o.bookingType) &&
      !hasTemporaryServiceLocation(o),
  )
  @IsNotEmpty({
    message:
      'addressId or temporary location (tempLatitude, tempLongitude, tempFullAddress) is required when any serviceMode is HOME_SERVICE',
  })
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    description:
      'Temporary service latitude (current location). Use with tempLongitude + tempFullAddress instead of addressId for HOME_SERVICE.',
    example: 6.524379,
  })
  @ValidateIf(
    (o: BookingPaymentPayloadDto) =>
      requiresHomeServiceAddress(o.services, o.bookingType) && !o.addressId,
  )
  @IsNotEmpty({
    message:
      'tempLatitude is required when addressId is omitted for HOME_SERVICE bookings',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  tempLatitude?: number;

  @ApiPropertyOptional({
    description:
      'Temporary service longitude (current location). Use with tempLatitude + tempFullAddress instead of addressId for HOME_SERVICE.',
    example: 3.379206,
  })
  @ValidateIf(
    (o: BookingPaymentPayloadDto) =>
      requiresHomeServiceAddress(o.services, o.bookingType) && !o.addressId,
  )
  @IsNotEmpty({
    message:
      'tempLongitude is required when addressId is omitted for HOME_SERVICE bookings',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  tempLongitude?: number;

  @ApiPropertyOptional({
    description:
      'Human-readable temporary service address (current location). Use with tempLatitude + tempLongitude instead of addressId for HOME_SERVICE.',
    example: '12 Admiralty Way, Lekki Phase 1, Lagos',
  })
  @ValidateIf(
    (o: BookingPaymentPayloadDto) =>
      requiresHomeServiceAddress(o.services, o.bookingType) && !o.addressId,
  )
  @IsNotEmpty({
    message:
      'tempFullAddress is required when addressId is omitted for HOME_SERVICE bookings',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  tempFullAddress?: string;

  @ApiPropertyOptional({
    description:
      'Temporary service city (current location). Required with tempLatitude/tempLongitude/tempFullAddress when addressId is omitted for HOME_SERVICE bookings.',
    example: 'Lagos',
  })
  @ValidateIf(
    (o: BookingPaymentPayloadDto) =>
      requiresHomeServiceAddress(o.services, o.bookingType) && !o.addressId,
  )
  @IsNotEmpty({
    message:
      'tempCity is required when addressId is omitted for HOME_SERVICE bookings',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  tempCity?: string;

  @ApiPropertyOptional({
    description:
      'Temporary service state (current location). Required with tempLatitude/tempLongitude/tempFullAddress when addressId is omitted for HOME_SERVICE bookings.',
    example: 'Lagos',
  })
  @ValidateIf(
    (o: BookingPaymentPayloadDto) =>
      requiresHomeServiceAddress(o.services, o.bookingType) && !o.addressId,
  )
  @IsNotEmpty({
    message:
      'tempState is required when addressId is omitted for HOME_SERVICE bookings',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  tempState?: string;

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

  @ApiPropertyOptional({
    description:
      'Branch ID for walk-in pricing and availability. Optional until enforcement is enabled.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
