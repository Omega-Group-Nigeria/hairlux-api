import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobType } from '@prisma/client';
import {
  IsString,
  IsEnum,
  IsArray,
  IsBoolean,
  IsOptional,
  IsDateString,
  MinLength,
  ArrayMinSize,
} from 'class-validator';

export class CreateJobDto {
  @ApiProperty({
    example: 'Senior Hair Stylist',
    description: 'Job title',
  })
  @IsString()
  @MinLength(3)
  title: string;

  @ApiProperty({
    enum: JobType,
    example: JobType.FULL_TIME,
    description: 'Employment type',
  })
  @IsEnum(JobType)
  type: JobType;

  @ApiProperty({
    example: 'Lagos, Nigeria',
    description: 'Job location (city, state or "Remote")',
  })
  @IsString()
  location: string;

  @ApiProperty({
    description:
      'Full job description — supports Markdown or plain text. Min 20 characters.',
    example:
      '## About the Role\n\nWe are looking for a talented senior stylist to join the HairLux team...',
  })
  @IsString()
  @MinLength(20)
  description: string;

  @ApiProperty({
    description: 'List of responsibilities (array of short strings)',
    example: [
      'Perform hair styling services for clients',
      'Maintain a clean and professional workstation',
      'Upsell products and additional services',
    ],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  responsibilities: string[];

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Publish immediately (true) or save as draft (false)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Application closing date (ISO 8601). Omit for no deadline.',
    example: '2026-04-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  closingDate?: string;
}
