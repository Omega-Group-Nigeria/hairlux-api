import {
  IsIn,
  IsNotEmpty,
  IsArray,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class PayBookingDto {
  @ApiProperty({
    description: 'One or more booking IDs to pay for in a single transaction',
    type: [String],
    example: [
      '123e4567-e89b-12d3-a456-426614174010',
      '123e4567-e89b-12d3-a456-426614174011',
    ],
  })
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  bookingIds: string[];

  @ApiProperty({
    example: 'WALLET',
    description: 'Payment method (WALLET or CASH)',
    enum: ['WALLET', 'CASH'],
  })
  @IsIn(['WALLET', 'CASH'], { message: 'Invalid payment method' })
  @IsNotEmpty({ message: 'Payment method is required' })
  paymentMethod: PaymentMethod;
}
