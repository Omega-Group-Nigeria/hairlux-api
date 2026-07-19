import { IsEnum, IsOptional, IsString, ValidateIf, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ApplicationStatus } from '@prisma/client';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateApplicationStatusDto {
  @ApiProperty({
    enum: ApplicationStatus,
    description: 'EMPLOYED cannot be set here — use POST /admin/applications/:id/convert-to-staff instead',
  })
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;

  @ApiPropertyOptional({
    description: 'Required when status is NOT_SELECTED',
    example: 'Did not meet minimum experience requirement',
  })
  @ValidateIf((o) => o.status === ApplicationStatus.NOT_SELECTED)
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  reason?: string;
}