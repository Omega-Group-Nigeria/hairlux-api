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
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingType, PaymentMethod } from '@prisma/client';

const SERVICE_MODE_VALUES = [BookingType.HOME_SERVICE, BookingType.WALK_IN];

export function requiresHomeServiceAddress(
  services: Array<Pick<ServiceBookingItemDto, 'serviceMode'>> | undefined,
  fallbackBookingType?: BookingType,
): boolean {
  if (
    Array.isArray(services) &&
    services.some((item) => item?.serviceMode === BookingType.HOME_SERVICE)
  ) {
    return true;
  }

  return fallbackBookingType === BookingType.HOME_SERVICE;
}

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

  @ApiPropertyOptional({
    description:
      'Booking mode for this specific service item. Use this for mixed-mode bookings.',
    enum: [BookingType.HOME_SERVICE, BookingType.WALK_IN],
    example: 'WALK_IN',
  })
  @IsOptional()
  @IsIn(SERVICE_MODE_VALUES, {
    message: 'serviceMode must be HOME_SERVICE or WALK_IN',
  })
  serviceMode?: BookingType;
}

export class CreateBookingDto {
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
      'Address ID from user saved addresses (required if any service has serviceMode HOME_SERVICE)',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @ValidateIf((o: CreateBookingDto) =>
    requiresHomeServiceAddress(o.services, o.bookingType),
  )
  @IsNotEmpty({
    message:
      'addressId is required when any serviceMode is HOME_SERVICE (or legacy bookingType is HOME_SERVICE)',
  })
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
    enum: ['WALLET', 'CASH'],
    example: 'WALLET',
  })
  @IsIn(['WALLET', 'CASH'], {
    message: 'paymentMethod must be WALLET or CASH',
  })
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

  @ApiProperty({
    description:
      'Client-generated idempotency key for retry-safe booking creation (prevents duplicate bookings on double-click or network retry)',
    example: 'book-8f19405c-84de-4863-aaf1-9913e4b52a35',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  idempotencyKey: string;
}
