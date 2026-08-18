import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyPhoneOtpDto {
    @ApiProperty({ example: '123456' })
    @IsNotEmpty()
    @IsString()
    otpCode: string;
}