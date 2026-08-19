import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateAdvertBannerDto {
  @ApiProperty({
    description: 'Banner title',
    example: 'Back to School 20% Off',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @ApiPropertyOptional({
    description: 'URL opened when the banner is tapped',
    example: 'https://hairlux.com.ng/promo/bts',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  linkUrl?: string;

  @ApiPropertyOptional({
    description: 'Whether the banner is visible on the home screen',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Carousel order (ascending — lower appears first). Omitted = appended last.',
    example: 1,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
