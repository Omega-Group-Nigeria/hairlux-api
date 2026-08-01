import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryBeauticiansDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const raw = obj?.[key] ?? value;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return val ? parseInt(val, 10) : 1;
  })
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const raw = obj?.[key] ?? value;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return val ? parseInt(val, 10) : 20;
  })
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search name, email, or phone' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: KycStatus })
  @IsOptional()
  @IsEnum(KycStatus)
  kycStatus?: KycStatus;

  @ApiPropertyOptional({ enum: ProfileReviewStatus })
  @IsOptional()
  @IsEnum(ProfileReviewStatus)
  profileStatus?: ProfileReviewStatus;

  @ApiPropertyOptional({ enum: AvailabilityStatus })
  @IsOptional()
  @IsEnum(AvailabilityStatus)
  availabilityStatus?: AvailabilityStatus;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const raw = obj?.[key] ?? value;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return val !== undefined ? parseFloat(val) : undefined;
  })
  @IsNumber()
  @Min(0)
  @Max(5)
  ratingMin?: number;
}