import { ApiProperty, OmitType } from '@nestjs/swagger';
import {
  IsDate,
  IsNotEmpty,
  IsString,
  Matches,
  MaxDate,
  MinDate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { RegisterDto } from './register.dto';

/** Calendar lower bound (UTC midnight). */
const MIN_DATE_OF_BIRTH = new Date(Date.UTC(1920, 0, 1));

/**
 * Parse beautician DOB from app payload.
 * Accepts `YYYY-MM-DD` (preferred) or ISO datetime; always stores as UTC date.
 *
 * Note: class-validator `@MinDate` / `@MaxDate` require a real `Date`.
 * Leaving the value as a string makes both validators fail with
 * "must be after 1920…" and "cannot be in the future" even for valid dates.
 */
function parseBeauticianDateOfBirth(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? value : value;
  }
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  // Preferred app format: calendar date only
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    // Reject invalid calendar dates (e.g. 2020-02-31 rolls over)
    if (
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day
    ) {
      return new Date(NaN);
    }
    return utc;
  }

  // Fallback: full ISO string
  const parsed = new Date(trimmed);
  return parsed;
}

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
  @Transform(({ value }) => parseBeauticianDateOfBirth(value))
  @IsNotEmpty({ message: 'Date of birth is required' })
  @IsDate({
    message: 'Date of birth must be a valid ISO date (YYYY-MM-DD)',
  })
  @MaxDate(() => new Date(), {
    message: 'Date of birth cannot be in the future',
  })
  @MinDate(MIN_DATE_OF_BIRTH, {
    message: 'Date of birth must be after 1920-01-01',
  })
  dateOfBirth: Date;
}
