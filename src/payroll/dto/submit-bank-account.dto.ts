import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SubmitBankAccountDto {
    @ApiProperty({ example: '058', description: 'Paystack bank code' })
    @IsString()
    bankCode: string;

    @ApiProperty({ example: '0123456789' })
    @IsString()
    accountNumber: string;
}