import {
  IsOptional,
  IsString,
  IsIn,
  IsInt,
  Min,
  Max,
  IsBoolean,
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

export class QueryStaffDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'amara',
    description: 'Search by name, code, email, phone, role, or location',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  search?: string;

  @ApiPropertyOptional({ enum: STAFF_EMPLOYMENT_STATUS_VALUES })
  @IsOptional()
  @IsIn(STAFF_EMPLOYMENT_STATUS_VALUES)
  employmentStatus?: StaffEmploymentStatusValue;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Filter by managed location id',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ example: 'Senior Stylist' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  currentRole?: string;

  @ApiPropertyOptional({
    description: 'Include archived records in results',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return false;
  })
  @IsBoolean()
  includeArchived?: boolean = false;
}
