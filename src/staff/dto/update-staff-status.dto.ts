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
  DISCIPLINARY_ACTION_TYPE_VALUES,
  type StaffEmploymentStatusValue,
  type DisciplinaryActionTypeValue,
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
  @ValidateIf((o) => o.status === 'EXITED' || o.status === 'ARCHIVED')
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

  @ApiPropertyOptional({
    description:
      'When set, this status change is also logged as a structured disciplinary record (e.g. a Suspension). Omit for non-disciplinary changes like ON_LEAVE or reactivating to ACTIVE.',
    enum: DISCIPLINARY_ACTION_TYPE_VALUES,
  })
  @IsOptional()
  @IsIn(DISCIPLINARY_ACTION_TYPE_VALUES)
  disciplinaryType?: DisciplinaryActionTypeValue;

  @ApiPropertyOptional({
    description: 'Required when disciplinaryType is set',
    example: 'Repeated unexcused lateness despite prior verbal warning',
  })
  @ValidateIf((o) => !!o.disciplinaryType)
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  disciplinaryReason?: string;
}
