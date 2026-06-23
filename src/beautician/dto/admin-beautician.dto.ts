import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

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