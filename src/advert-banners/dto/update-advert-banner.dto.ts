import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAdvertBannerDto {
  @ApiPropertyOptional({
    description: 'Banner title',
    example: 'Back to School 20% Off',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @ApiPropertyOptional({
    description:
      'URL opened when the banner is tapped. Send null to clear the link.',
    example: 'https://hairlux.com.ng/promo/bts',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  linkUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Whether the banner is visible on the home screen',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Carousel order (ascending — lower appears first).',
    example: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
