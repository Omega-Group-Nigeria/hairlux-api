import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export enum BeauticianReviewSortBy {
  RATING = 'rating',
  CREATED_AT = 'createdAt',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

function toInt(value: unknown, fallback?: number): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : fallback;
}

export class QueryBeauticianReviewsDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value, obj, key }) => toInt(obj?.[key] ?? value, 1))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Transform(({ value, obj, key }) => toInt(obj?.[key] ?? value, 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: BeauticianReviewSortBy,
    default: BeauticianReviewSortBy.CREATED_AT,
    description: 'Sort field',
  })
  @IsOptional()
  @IsEnum(BeauticianReviewSortBy)
  sortBy?: BeauticianReviewSortBy = BeauticianReviewSortBy.CREATED_AT;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.DESC,
    description: 'Sort direction',
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const n = toInt(obj?.[key] ?? value);
    return n;
  })
  @IsInt()
  @Min(1)
  @Max(5)
  ratingMin?: number;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 5 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const n = toInt(obj?.[key] ?? value);
    return n;
  })
  @IsInt()
  @Min(1)
  @Max(5)
  ratingMax?: number;

  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}
