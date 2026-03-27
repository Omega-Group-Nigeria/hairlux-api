import {
  IsIn,
  IsOptional,
  IsString,
  IsDateString,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  STAFF_EMPLOYMENT_STATUS_VALUES,
  type StaffEmploymentStatusValue,
} from './create-staff.dto';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateStaffStatusDto {
  @ApiProperty({ enum: STAFF_EMPLOYMENT_STATUS_VALUES })
  @IsIn(STAFF_EMPLOYMENT_STATUS_VALUES)
  status: StaffEmploymentStatusValue;

  @ApiPropertyOptional({
    description: 'Required when status is EXITED or ARCHIVED',
    example: 'Resigned for personal reasons',
  })
  @ValidateIf((o) =>
    o.status === 'EXITED' || o.status === 'ARCHIVED',
  )
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  reasonForExit?: string;

  @ApiPropertyOptional({
    description: 'Exit date, defaults to now when status is EXITED/ARCHIVED',
    example: '2026-03-05',
  })
  @IsOptional()
  @IsDateString()
  exitDate?: string;
}
