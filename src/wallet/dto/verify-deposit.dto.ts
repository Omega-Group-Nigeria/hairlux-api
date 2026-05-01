import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PaymentProvider } from './initialize-deposit.dto';

export class VerifyDepositDto {
  @ApiProperty({
    description: 'Transaction reference (internal WALLET-xxx reference)',
    example: 'WALLET-1234567890-abc',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reference is required' })
  reference: string;

  @ApiPropertyOptional({
    description: 'Payment provider used to initialize the deposit',
    enum: ['paystack', 'monnify'],
    default: 'paystack',
    example: 'monnify',
  })
  @IsOptional()
  @IsIn(['paystack', 'monnify'], {
    message: 'Provider must be paystack or monnify',
  })
  provider?: PaymentProvider;
}
