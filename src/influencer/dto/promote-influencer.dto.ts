import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class PromoteInfluencerDto {
  @ApiPropertyOptional({
    description: 'Internal admin notes about this influencer',
    example: 'Fashion influencer, 50k Instagram followers',
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  @IsString()
  notes?: string;
}
