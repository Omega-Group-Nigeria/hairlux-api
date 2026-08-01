import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryPendingProfileReviewsDto {
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

  @ApiPropertyOptional({
    example: 7,
    description: 'Filter profiles submitted at least N days ago',
  })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const raw = obj?.[key] ?? value;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return val !== undefined ? parseInt(val, 10) : undefined;
  })
  @IsInt()
  @Min(0)
  submittedDaysAgoMin?: number;
}