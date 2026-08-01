import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DispatchTierSettingsDto {
  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(3)
  tier: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  radiusKm?: number;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(300)
  offerTtlSeconds?: number;
}

export class UpdateDispatchSettingsDto {
  @ApiPropertyOptional({ type: [DispatchTierSettingsDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => DispatchTierSettingsDto)
  tiers?: DispatchTierSettingsDto[];

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  interTierDelaySeconds?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  locationStalenessMinutes?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(10000)
  locationRematchMinDistanceM?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'When true, a beautician coming online may auto-retry exhausted bookings once (within max tier radius).',
  })
  @IsOptional()
  @IsBoolean()
  wakeExhaustedOnOnlineEnabled?: boolean;
}