import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthAccountType } from './account-type.enum';

export class LoginDto {
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    example: 'SecurePass123',
    description: 'User password',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @ApiPropertyOptional({
    description:
      'Which account to sign into when the email has both a USER and a BEAUTICIAN account. Omit for the legacy single-account lookup.',
    enum: AuthAccountType,
    example: AuthAccountType.USER,
  })
  @IsOptional()
  @IsEnum(AuthAccountType)
  type?: AuthAccountType;
}
