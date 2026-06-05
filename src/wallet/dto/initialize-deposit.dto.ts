import {
  IsNumber,
  IsPositive,
  Min,
  Max,
  IsOptional,
  IsIn,
  IsUrl,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type PaymentProvider = 'paystack' | 'monnify';

export class InitializeDepositDto {
  @ApiProperty({
    description: 'Amount to deposit (in Naira)',
    example: 5000,
    minimum: 100,
    maximum: 1000000,
  })
  @IsNumber()
  @IsPositive({ message: 'Amount must be a positive number' })
  @Min(100, { message: 'Minimum deposit is ₦100' })
  @Max(1000000, { message: 'Maximum deposit is ₦1,000,000' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Payment provider to use',
    enum: ['paystack', 'monnify'],
    default: 'paystack',
    example: 'monnify',
  })
  @IsOptional()
  @IsIn(['paystack', 'monnify'], {
    message: 'Provider must be paystack or monnify',
  })
  provider?: PaymentProvider;

  @ApiPropertyOptional({
    description:
      'Optional redirect URL after payment (overrides MONNIFY_REDIRECT_URL). Useful for mobile deep links.',
    example: 'myapp://payment/success',
  })
  @IsOptional()
  @IsString()
  redirectUrl?: string;
}
