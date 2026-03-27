import {
  IsOptional,
  IsString,
  IsDateString,
  IsIn,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  STAFF_EMPLOYMENT_TYPE_VALUES,
  type StaffEmploymentTypeValue,
} from './create-staff.dto';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateEmploymentHistoryDto {
  @ApiPropertyOptional({ example: 'Branch Manager' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  roleTitle?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Managed staff location id',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ enum: STAFF_EMPLOYMENT_TYPE_VALUES })
  @IsOptional()
  @IsIn(STAFF_EMPLOYMENT_TYPE_VALUES)
  employmentType?: StaffEmploymentTypeValue;

  @ApiPropertyOptional({ example: '2026-03-10' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-10' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'Promoted after annual review' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  reasonForChange?: string;

  @ApiPropertyOptional({ example: 'Oversees weekend operations' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  notes?: string;
}
