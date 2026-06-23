import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateBeauticianProfileDto {
  @ApiPropertyOptional({ example: 'Professional braider with 8 years experience.' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  bio?: string;

  @ApiPropertyOptional({ example: ['Box Braids', 'Makeup'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ example: ['Certified Hair Stylist - GHBA'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @ApiPropertyOptional({ example: '12 Admiralty Way, Lekki, Lagos' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  baseAddress?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  serviceRadiusKm?: number;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/.../photo.webp' })
  @IsOptional()
  @IsUrl()
  profilePhotoUrl?: string;
}