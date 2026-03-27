import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsDateString,
  IsIn,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toLowerTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const STAFF_EMPLOYMENT_STATUS_VALUES = [
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'EXITED',
  'ARCHIVED',
] as const;

export const STAFF_EMPLOYMENT_TYPE_VALUES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERN',
  'TEMPORARY',
] as const;

export type StaffEmploymentStatusValue =
  (typeof STAFF_EMPLOYMENT_STATUS_VALUES)[number];
export type StaffEmploymentTypeValue =
  (typeof STAFF_EMPLOYMENT_TYPE_VALUES)[number];

export class CreateStaffDto {
  @ApiProperty({ example: 'Amara Okafor' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => toTrimmedString(value))
  name: string;

  @ApiProperty({ example: 'Senior Stylist' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => toTrimmedString(value))
  currentRole: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Managed staff location id',
  })
  @IsUUID()
  locationId: string;

  @ApiPropertyOptional({ example: 'amara@hairlux.com' })
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => toLowerTrimmedString(value))
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  phone?: string;

  @ApiPropertyOptional({
    example: '1996-06-15',
    description: 'ISO date string (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    enum: STAFF_EMPLOYMENT_STATUS_VALUES,
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsIn(STAFF_EMPLOYMENT_STATUS_VALUES)
  employmentStatus?: StaffEmploymentStatusValue;

  @ApiPropertyOptional({
    enum: STAFF_EMPLOYMENT_TYPE_VALUES,
    example: 'FULL_TIME',
    description: 'Initial employment type for opening history entry',
  })
  @IsOptional()
  @IsIn(STAFF_EMPLOYMENT_TYPE_VALUES)
  employmentType?: StaffEmploymentTypeValue;

  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'Initial employment history start date',
  })
  @IsOptional()
  @IsDateString()
  employmentStartDate?: string;

  @ApiPropertyOptional({ example: 'Hired as branch launch lead' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  employmentNotes?: string;
}
