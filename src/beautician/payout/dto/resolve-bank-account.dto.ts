import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class ResolveBankAccountDto {
  @ApiProperty({ example: '058', description: 'Paystack bank code' })
  @IsString()
  @MaxLength(20)
  bankCode: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @Matches(/^\d{10}$/, { message: 'Account number must be 10 digits' })
  accountNumber: string;
}