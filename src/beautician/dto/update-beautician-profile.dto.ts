import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
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
}