import { ApiProperty, OmitType } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsString,
  Matches,
  MaxDate,
  MinDate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { RegisterDto } from './register.dto';

const MIN_DATE_OF_BIRTH = new Date('1920-01-01');

export class RegisterBeauticianDto extends OmitType(RegisterDto, [
  'phone',
] as const) {
  @ApiProperty({
    example: '+2348012345678',
    description: 'Beautician phone number (must be unique)',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, {
    message: 'Invalid phone number format',
  })
  phone: string;

  @ApiProperty({
    example: '1996-06-15',
    description: 'Date of birth (ISO date YYYY-MM-DD)',
  })
  @Transform(({ value }) => value?.trim())
  @IsDateString(
    {},
    { message: 'Date of birth must be a valid ISO date (YYYY-MM-DD)' },
  )
  @IsNotEmpty({ message: 'Date of birth is required' })
  @MaxDate(() => new Date(), {
    message: 'Date of birth cannot be in the future',
  })
  @MinDate(MIN_DATE_OF_BIRTH, {
    message: 'Date of birth must be after 1920-01-01',
  })
  dateOfBirth: string;
}