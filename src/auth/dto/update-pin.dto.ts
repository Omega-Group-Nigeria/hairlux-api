import {
  IsString,
  IsNotEmpty,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePinDto {
  @ApiProperty({
    description: 'Your current 4-6 digit security PIN',
    example: '1234',
  })
  @IsString()
  @IsNotEmpty({ message: 'Current PIN is required' })
  @MinLength(4, { message: 'Current PIN must be at least 4 digits' })
  @MaxLength(6, { message: 'Current PIN must not exceed 6 digits' })
  @Matches(/^\d+$/, { message: 'Current PIN must contain only numeric digits' })
  currentPin: string;

  @ApiProperty({
    description: 'Your new 4-6 digit security PIN',
    example: '5678',
  })
  @IsString()
  @IsNotEmpty({ message: 'New PIN is required' })
  @MinLength(4, { message: 'New PIN must be at least 4 digits' })
  @MaxLength(6, { message: 'New PIN must not exceed 6 digits' })
  @Matches(/^\d+$/, { message: 'New PIN must contain only numeric digits' })
  newPin: string;

  @ApiProperty({
    description: 'Confirmation of the new PIN (must match newPin)',
    example: '5678',
  })
  @IsString()
  @IsNotEmpty({ message: 'New PIN confirmation is required' })
  confirmNewPin: string;
}
