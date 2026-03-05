import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateInfluencerDto {
  @ApiPropertyOptional({
    description: 'Internal admin notes',
    example: 'Instagram: @janeokafor — 50k followers',
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Activate or deactivate the influencer',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
