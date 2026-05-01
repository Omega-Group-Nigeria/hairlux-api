import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryReferralCampaignCodesDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by active or inactive campaign code',
    enum: ['true', 'false'],
    example: 'false',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return String(value).trim().toLowerCase();
  })
  @IsIn(['true', 'false'], {
    message: 'isActive must be either true or false',
  })
  isActive?: 'true' | 'false';

  @ApiPropertyOptional({
    description: 'Case-insensitive search by campaign code',
    example: 'LAUNCH',
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim() || undefined)
  @IsString()
  code?: string;
}
