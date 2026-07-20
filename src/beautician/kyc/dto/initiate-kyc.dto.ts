import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Body for POST /beauticians/kyc/initiate.
 * portfolioUrl is required and restricted to https to reduce open-redirect / XSS risk.
 */
export class InitiateKycDto {
  @ApiProperty({
    description:
      'Public HTTPS URL to the beautician portfolio or work showcase (required at KYC start)',
    example: 'https://instagram.com/stylist.ada',
    maxLength: 2048,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @MaxLength(2048)
  @IsUrl(
    {
      protocols: ['https'],
      require_protocol: true,
      require_valid_protocol: true,
      // Disallow credentials in URL (https://user:pass@host)
      disallow_auth: true,
    },
    { message: 'portfolioUrl must be a valid https URL without credentials' },
  )
  portfolioUrl!: string;
}
