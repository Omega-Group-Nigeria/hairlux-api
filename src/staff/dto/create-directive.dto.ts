import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateDirectiveDto {
  @ApiProperty({ example: 'Submit updated price list' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @ApiProperty({ example: 'Please review and confirm the new service price list by Friday.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  body: string;

  @ApiPropertyOptional({
    description:
      'Send to one specific staff member. Exactly one of targetStaffId / ' +
      'targetLocationId must be provided.',
  })
  @ValidateIf((o) => !o.targetLocationId)
  @IsUUID()
  targetStaffId?: string;

  @ApiPropertyOptional({
    description:
      'Send to every active staff member at this branch -- creates one ' +
      'independent Directive row per person, each with its own status.',
  })
  @ValidateIf((o) => !o.targetStaffId)
  @IsUUID()
  targetLocationId?: string;
}