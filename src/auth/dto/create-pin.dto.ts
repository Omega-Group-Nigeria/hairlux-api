import {
  IsString,
  IsNotEmpty,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePinDto {
  @ApiProperty({
    description: '4 to 6 digit PIN for transaction/security confirmation',
    example: '1234',
    minLength: 4,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty({ message: 'PIN is required' })
  @MinLength(4, { message: 'PIN must be at least 4 digits' })
  @MaxLength(6, { message: 'PIN must not exceed 6 digits' })
  @Matches(/^\d+$/, { message: 'PIN must contain only numeric digits' })
  pin: string;

  @ApiProperty({
    description: 'Confirmation of the PIN (must match pin)',
    example: '1234',
  })
  @IsString()
  @IsNotEmpty({ message: 'PIN confirmation is required' })
  confirmPin: string;

  @ApiProperty({
    description:
      'Current account password (required when setting PIN for the first time for security)',
    example: 'YourCurrentPassword123',
    required: false,
  })
  @IsString()
  @IsNotEmpty({ message: 'Current password is required to set your initial PIN' })
  password: string;
}
