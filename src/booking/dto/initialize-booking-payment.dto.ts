import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BookingPaymentPayloadDto } from './booking-payment-payload.dto';

export class InitializeBookingPaymentDto {
  @ApiProperty({
    description: 'Booking details to be created after successful payment',
    type: BookingPaymentPayloadDto,
  })
  @ValidateNested()
  @Type(() => BookingPaymentPayloadDto)
  bookingPayload: BookingPaymentPayloadDto;

  @ApiProperty({
    description: 'Expected total amount to pay (must match server-calculated total)',
    example: 15500,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount: number;

  @ApiProperty({
    description: 'Payment provider',
    example: 'monnify',
    enum: ['monnify'],
  })
  @IsIn(['monnify'])
  provider: 'monnify';

  @ApiProperty({
    description: 'Client-generated idempotency key for retry-safe initialize calls',
    example: 'bookpay-8f19405c-84de-4863-aaf1-9913e4b52a35',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
