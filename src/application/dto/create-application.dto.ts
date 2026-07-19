import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toLowerTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateApplicationDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Job posting this application is for, if applying via a listing',
  })
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({
    example: 'Senior Hair Stylist',
    description:
      'Role title captured at submission time (denormalized so it survives even if the job posting later changes or is removed)',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  appliedRole?: string;

  @ApiProperty({ example: 'Bunch' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => toTrimmedString(value))
  firstName: string;

  @ApiPropertyOptional({ example: 'Ade' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  middleName?: string;

  @ApiProperty({ example: 'Dillon' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => toTrimmedString(value))
  lastName: string;

  @ApiProperty({
    example: '63184876213',
    description: '11-digit NIN — expected to already be verified via POST /nin/verify before this is submitted',
  })
  @IsString()
  @Matches(/^\d{11}$/, { message: 'nin must be exactly 11 digits' })
  nin: string;

  @ApiPropertyOptional({
    example: '6 January 1974',
    description:
      'Free text as returned by the NIN lookup (not a strict ISO date — the applicant can edit it, and NIMC dates are not reliably parseable), so this is stored as-is rather than validated as a date',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Male' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  gender?: string;

  @ApiProperty({ example: '08000000000' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => toTrimmedString(value))
  phone: string;

  @ApiProperty({ example: '1193 Tola Cresent, Wuse, Abuja Municipal, FCT Abuja' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => toTrimmedString(value))
  address: string;

  @ApiProperty({ example: 'applicant@email.com' })
  @IsEmail()
  @Transform(({ value }) => toLowerTrimmedString(value))
  email: string;

  @ApiPropertyOptional({ example: '1–3 years' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => toTrimmedString(value))
  yearsOfExperience?: string;

  @ApiPropertyOptional({ example: 'Glamour Touch Salon' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  previousEmployer?: string;

  @ApiPropertyOptional({ example: '24 Ring Road, Ibadan' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  previousEmployerAddress?: string;

  @ApiPropertyOptional({ example: '+2348030000000' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  previousEmployerPhone?: string;

  @ApiProperty({ example: 'I am a passionate hair stylist with over 3 years of experience...' })
  @IsString()
  @IsNotEmpty()
  coverNote: string;

  @ApiPropertyOptional({
    description: 'Preferred staff location id — only usable once the frontend branch dropdown sends real location ids',
  })
  @IsOptional()
  @IsUUID()
  preferredLocationId?: string;

  @ApiPropertyOptional({
    example: 'Academy Branch, Ibadan',
    description: 'Free-text fallback while the frontend branch dropdown is still hardcoded rather than pulling real locations',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  preferredBranchText?: string;

  @ApiPropertyOptional({ description: 'CV file URL — file upload endpoint is a TODO, left optional for now' })
  @IsOptional()
  @IsString()
  cvUrl?: string;

  @ApiPropertyOptional({ description: 'Portfolio file URL — file upload endpoint is a TODO, left optional for now' })
  @IsOptional()
  @IsString()
  portfolioUrl?: string;
}