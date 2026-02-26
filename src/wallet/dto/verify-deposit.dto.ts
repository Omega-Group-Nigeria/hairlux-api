import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDepositDto {
  @ApiProperty({
    description: 'Paystack transaction reference',
    example: 'WALLET-1234567890',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reference is required' })
  reference: string;
}
