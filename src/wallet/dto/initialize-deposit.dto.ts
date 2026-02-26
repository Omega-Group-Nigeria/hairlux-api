import { IsNumber, IsPositive, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
