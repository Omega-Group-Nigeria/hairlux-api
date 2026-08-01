import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** How far to roll back a pending profile review. */
export enum ProfileRejectScope {
  /** Full reject: unlock profile edit; beautician resubmits profile then video. */
  FULL = 'FULL',
  /** Video only: keep profile locked; set AWAITING_VIDEO and clear video key. */
  VIDEO_ONLY = 'VIDEO_ONLY',
}

export class RejectKycDto {
  @ApiProperty({ example: 'Identity documents could not be verified.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ApproveProfileDto {
  @ApiPropertyOptional({ example: 'Strong in-office demonstration.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectProfileDto {
  @ApiProperty({ example: 'Insufficient experience documentation.' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 'Candidate may reapply after 30 days.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: ProfileRejectScope,
    default: ProfileRejectScope.FULL,
    description:
      'FULL: reject entire submission (profile editable again). VIDEO_ONLY: request a new intro video only (status → AWAITING_VIDEO).',
  })
  @IsOptional()
  @IsEnum(ProfileRejectScope)
  scope?: ProfileRejectScope = ProfileRejectScope.FULL;
}

export class UpdateAdminBeauticianDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 0.75 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRateOverride?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class AssignBeauticianServicesDto {
  @ApiProperty({
    type: [String],
    example: ['service-uuid-1', 'service-uuid-2'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds: string[];
}