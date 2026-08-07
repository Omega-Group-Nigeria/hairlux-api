import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobType } from '@prisma/client';
import {
  IsString,
  IsEnum,
  IsArray,
  IsBoolean,
  IsOptional,
  IsDateString,
  IsUUID,
  IsNumber,
  Min,
  MinLength,
  ArrayMinSize,
  ValidateIf,
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
    description: 'Job location (city, state or "Remote") — kept for display; prefer branchId when the role is tied to a specific branch.',
  })
  @IsString()
  location: string;

  @ApiPropertyOptional({
    description: 'StaffLocation ID this posting is tied to. Omit for postings open across branches or not yet branch-specific. Kept for backward compatibility — prefer branchIds for new postings.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'One or more StaffLocation IDs this posting is available at. When provided, this is the source of truth for branch availability — branchId above is derived from the first entry for backward compatibility.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];

  @ApiPropertyOptional({
    example: 'Hair Styling',
    description: 'Department name (free text, matching Staff.currentRole convention)',
  })
  @IsOptional()
  @IsString()
  department?: string;

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

  @ApiPropertyOptional({ example: 80000, description: 'Advertised salary floor (NGN)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional({ example: 150000, description: 'Advertised salary ceiling (NGN)' })
  @ValidateIf((o) => o.salaryMin !== undefined)
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional({ example: 'Negotiable based on experience, plus commission', description: 'Free-text salary qualifier' })
  @IsOptional()
  @IsString()
  salaryNote?: string;
}