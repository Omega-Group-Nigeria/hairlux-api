import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'User email address',
  })
  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    example: 'SecurePass123',
    description:
      'Password (min 8 characters, must contain uppercase, lowercase, and number)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  @Matches(/^\S.*\S$|^\S$/, {
    message: 'Password must not start or end with whitespace',
  })
  password: string;

  @ApiProperty({
    example: 'John',
    description: 'User first name',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @Matches(/^\S/, { message: 'First name must not be only whitespace' })
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'User last name',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @Matches(/^\S/, { message: 'Last name must not be only whitespace' })
  lastName: string;

  @ApiProperty({
    example: '+2348012345678',
    description: 'User phone number (must be unique)',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim() || undefined)
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, {
    message: 'Invalid phone number format',
  })
  phone?: string;

  @ApiProperty({
    example: 'JOH-X7K2',
    description:
      'Optional referral code. Can be from an existing user or an admin-created launch/signup campaign code.',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim().toUpperCase() || undefined)
  @IsString()
  referralCode?: string;
}
