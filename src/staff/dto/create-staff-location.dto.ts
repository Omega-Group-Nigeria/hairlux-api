import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toUpperTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateStaffLocationDto {
  @ApiProperty({ example: 'Lekki Branch' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => toTrimmedString(value))
  name: string;

  @ApiPropertyOptional({
    example: 'LEK',
    description:
      'Short branch code used in staff IDs (e.g. HL-LEK-0001). 2-5 uppercase letters. ' +
      'If omitted, the server auto-suggests one from the branch name — the admin UI ' +
      'should pre-fill this from GET /admin/staff/locations/suggest-code and let the ' +
      'admin confirm or edit it before submitting, rather than relying on this default silently.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2,5}$/, {
    message: 'code must be 2-5 uppercase letters (e.g. LEK, IFE, ABJ)',
  })
  @Transform(({ value }) => toUpperTrimmedString(value))
  code?: string;

  @ApiProperty({
    example: '15 Admiralty Way, Lekki Phase 1, Lagos',
    description: 'Physical address for the location / branch',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(({ value }) => toTrimmedString(value))
  address: string;
}