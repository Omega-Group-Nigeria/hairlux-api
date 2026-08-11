import { IsEmail, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthAccountType } from './account-type.enum';

export class ResendOtpDto {
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

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
