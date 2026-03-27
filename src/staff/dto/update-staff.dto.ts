import {
  IsString,
  IsOptional,
  IsEmail,
  IsDateString,
  IsIn,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  STAFF_EMPLOYMENT_STATUS_VALUES,
  type StaffEmploymentStatusValue,
} from './create-staff.dto';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toLowerTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class UpdateStaffDto {
  @ApiPropertyOptional({ example: 'Amara Okafor' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  name?: string;

  @ApiPropertyOptional({ example: 'Senior Stylist' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  currentRole?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Managed staff location id',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

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

  @ApiPropertyOptional({ example: '1996-06-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: STAFF_EMPLOYMENT_STATUS_VALUES })
  @IsOptional()
  @IsIn(STAFF_EMPLOYMENT_STATUS_VALUES)
  employmentStatus?: StaffEmploymentStatusValue;

  @ApiPropertyOptional({ example: 'Relocated to Abuja branch' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  reasonForExit?: string;

  @ApiPropertyOptional({ example: '2026-02-02' })
  @IsOptional()
  @IsDateString()
  exitDate?: string;
}
