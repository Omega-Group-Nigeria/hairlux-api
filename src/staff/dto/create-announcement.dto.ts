import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export enum AnnouncementTargetDto {
  ALL = 'ALL',
  BRANCH = 'BRANCH',
  INDIVIDUAL = 'INDIVIDUAL',
}

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Public holiday closure — 3rd October' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @ApiProperty({ example: 'All branches will be closed on Friday 3rd October for the public holiday.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  body: string;

  @ApiProperty({ enum: AnnouncementTargetDto, example: AnnouncementTargetDto.ALL })
  @IsEnum(AnnouncementTargetDto)
  target: AnnouncementTargetDto;

  @ApiPropertyOptional({ description: 'Required when target is BRANCH' })
  @ValidateIf((o) => o.target === AnnouncementTargetDto.BRANCH)
  @IsUUID()
  targetLocationId?: string;

  @ApiPropertyOptional({ description: 'Required when target is INDIVIDUAL' })
  @ValidateIf((o) => o.target === AnnouncementTargetDto.INDIVIDUAL)
  @IsUUID()
  targetStaffId?: string;
}