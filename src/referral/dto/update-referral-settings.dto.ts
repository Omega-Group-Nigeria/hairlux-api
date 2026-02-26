import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReferralRewardType } from '@prisma/client';

export class UpdateReferralSettingsDto {
  @ApiProperty({
    description: 'Enable or disable the referral programme',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description:
      'How the reward is calculated — a fixed naira amount or a percentage of the deposit',
    enum: ReferralRewardType,
    example: ReferralRewardType.FIXED,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReferralRewardType)
  rewardType?: ReferralRewardType;

  @ApiProperty({
    description:
      'Reward amount. For FIXED: naira value (e.g. 500). For PERCENTAGE: 1–100 (e.g. 10 = 10%).',
    example: 500,
    minimum: 0.01,
    maximum: 1000000,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  rewardValue?: number;

  @ApiProperty({
    description:
      'Minimum deposit amount (₦) the referred user must make to trigger the reward. Set to 0 to reward any deposit.',
    example: 1000,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minDepositAmount?: number;
}
