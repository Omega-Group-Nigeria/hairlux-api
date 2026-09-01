import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Optional deadline for this task.' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

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

/**
 * Several distinct tasks (different title/body/recipient/due date each)
 * defined and sent together in one action — NOT one task to many recipients,
 * which CreateDirectiveDto's targetLocationId already covers on its own.
 * Each entry independently follows the exact same individual-or-branch-fanout
 * rule as a single CreateDirectiveDto.
 */
export class BulkCreateDirectivesDto {
  @ApiProperty({ type: [CreateDirectiveDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDirectiveDto)
  tasks: CreateDirectiveDto[];
}