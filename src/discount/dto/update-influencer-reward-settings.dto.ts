import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReferralRewardType } from '@prisma/client';

export class UpdateInfluencerRewardSettingsDto {
  @ApiPropertyOptional({
    description: 'Enable or disable influencer rewards globally',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: ReferralRewardType,
    example: ReferralRewardType.PERCENTAGE,
    description:
      'FIXED = flat naira amount per code use. PERCENTAGE = % of the discount amount the customer received.',
  })
  @IsOptional()
  @IsEnum(ReferralRewardType)
  rewardType?: ReferralRewardType;

  @ApiPropertyOptional({
    example: 10,
    description:
      'For FIXED: naira value (e.g. 500 = ₦500 per use). For PERCENTAGE: value 1-100 (e.g. 10 = 10% of customer discount).',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  rewardValue?: number;

  @ApiPropertyOptional({
    example: 5000,
    description:
      'Minimum booking total (after discount, in naira) required to trigger the reward. Set to 0 to reward any booking.',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPurchaseAmount?: number;
}
