import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class QueryInfluencerRewardsDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const rawValue = obj && obj[key] !== undefined ? obj[key] : value;
    const val = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    return val ? parseInt(val, 10) : 1;
  })
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const rawValue = obj && obj[key] !== undefined ? obj[key] : value;
    const val = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    return val ? parseInt(val, 10) : 20;
  })
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
