import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthAccountType } from './account-type.enum';

export class VerifyOtpDto {
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code',
  })
  @IsString()
  @IsNotEmpty({ message: 'OTP code is required' })
  @Length(6, 6, { message: 'OTP code must be 6 digits' })
  otpCode: string;

  @ApiPropertyOptional({
    description:
      'Which account type to target when the email has both a USER and a BEAUTICIAN account.',
    enum: AuthAccountType,
    example: AuthAccountType.USER,
  })
  @IsOptional()
  @IsEnum(AuthAccountType)
  type?: AuthAccountType;
}
