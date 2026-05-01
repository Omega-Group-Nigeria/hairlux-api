import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyBookingPaymentDto {
  @ApiProperty({
    description:
      'Internal booking payment reference returned during initialize',
    example: 'BOOKPAY-MONF-1776541610028-96d2eb2991f18da3',
  })
  @IsString()
  @IsNotEmpty()
  bookingPaymentReference: string;

  @ApiProperty({
    description: 'Payment provider',
    example: 'monnify',
    enum: ['monnify'],
  })
  @IsIn(['monnify'])
  provider: 'monnify';
}
