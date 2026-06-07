import { IsString, IsNotEmpty, Matches, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPinDto {
  @ApiProperty({
    description: 'Your 4-6 digit security PIN',
    example: '1234',
  })
  @IsString()
  @IsNotEmpty({ message: 'PIN is required' })
  @MinLength(4, { message: 'PIN must be at least 4 digits' })
  @MaxLength(6, { message: 'PIN must not exceed 6 digits' })
  @Matches(/^\d+$/, { message: 'PIN must contain only numeric digits' })
  pin: string;
}
