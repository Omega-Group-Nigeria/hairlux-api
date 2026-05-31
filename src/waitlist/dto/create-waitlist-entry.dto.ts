import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWaitlistEntryDto {
  @ApiProperty({
    example: 'Jane Doe',
    description: 'Full name of the person joining the waitlist',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(100, { message: 'Full name must not exceed 100 characters' })
  @Matches(/^\S/, { message: 'Full name must not be only whitespace' })
  fullName: string;

  @ApiProperty({
    example: 'jane.doe@example.com',
    description: 'Email address',
  })
  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}
