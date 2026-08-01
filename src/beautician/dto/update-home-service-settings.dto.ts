import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutMode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateHomeServiceSettingsDto {
  @ApiPropertyOptional({ example: 0.7, description: 'Beautician commission rate (0–1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  kycAutoApprove?: boolean;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  arrivalVerificationExpiryMinutes?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  serviceCompletionBufferMinutes?: number;

  @ApiPropertyOptional({ enum: PayoutMode, example: PayoutMode.MANUAL })
  @IsOptional()
  @IsEnum(PayoutMode)
  payoutMode?: PayoutMode;

  @ApiPropertyOptional({
    example: 500000,
    description:
      'Platform-wide total payout limit per calendar day (Africa/Lagos), in Naira. Null clears the limit (unlimited).',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyPayoutLimit?: number | null;

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(2000)
  arrivalGeoFenceMeters?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  noShowPenaltyEnabled?: boolean;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  noShowSuspendThreshold?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(180)
  noShowWindowDays?: number;
}