import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingPaymentPayloadDto } from './booking-payment-payload.dto';

export class InitializeBookingPaymentDto {
  @ApiProperty({
    description: 'Booking details to be created after successful payment',
    type: BookingPaymentPayloadDto,
  })
  @ValidateNested()
  @Type(() => BookingPaymentPayloadDto)
  bookingPayload: BookingPaymentPayloadDto;

  @ApiPropertyOptional({
    description:
      'Optional client-side shortfall hint. Server always computes the authoritative amount; if sent, it must match the server-calculated wallet shortfall.',
    example: 3500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiProperty({
    description: 'Payment provider',
    example: 'monnify',
    enum: ['monnify'],
  })
  @IsIn(['monnify'])
  provider: 'monnify';

  @ApiProperty({
    description:
      'Client-generated idempotency key for retry-safe initialize calls',
    example: 'bookpay-8f19405c-84de-4863-aaf1-9913e4b52a35',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  idempotencyKey: string;

  @ApiPropertyOptional({
    description:
      'Optional redirect URL after payment (overrides MONNIFY_REDIRECT_URL). Useful for mobile deep links.',
    example: 'myapp://payment/success',
  })
  @IsOptional()
  @IsString()
  redirectUrl?: string;
}
