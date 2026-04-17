import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ContactFormDto {
  @ApiProperty({
    description: 'Sender full name',
    example: 'Jane Doe',
    maxLength: 80,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(80, { message: 'Name must not exceed 80 characters' })
  @Matches(/^[a-zA-Z0-9 .,'-]+$/, {
    message: 'Name contains invalid characters',
  })
  name: string;

  @ApiProperty({
    description: 'Sender email address',
    example: 'jane.doe@example.com',
    maxLength: 120,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email address is required' })
  @MaxLength(120, { message: 'Email address must not exceed 120 characters' })
  emailAddress: string;

  @ApiProperty({
    description: 'Sender phone number',
    example: '+2348012345678',
    maxLength: 20,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @MaxLength(20, { message: 'Phone number must not exceed 20 characters' })
  @Matches(/^[+()0-9\s-]{7,20}$/, {
    message: 'Invalid phone number format',
  })
  phoneNo: string;

  @ApiProperty({
    description: 'Contact message subject',
    example: 'Partnership enquiry',
    minLength: 3,
    maxLength: 120,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Subject is required' })
  @MinLength(3, { message: 'Subject must be at least 3 characters' })
  @MaxLength(120, { message: 'Subject must not exceed 120 characters' })
  subject: string;

  @ApiProperty({
    description: 'Contact message body',
    example: 'Hello team, I would like to inquire about your services.',
    minLength: 10,
    maxLength: 2000,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Message is required' })
  @MinLength(10, { message: 'Message must be at least 10 characters' })
  @MaxLength(2000, { message: 'Message must not exceed 2000 characters' })
  message: string;
}
