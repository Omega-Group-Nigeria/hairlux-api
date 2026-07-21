import { IsDateString, IsString, IsNotEmpty, IsUUID, IsOptional, IsEnum, IsUrl, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { InterviewMode } from '@prisma/client';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ScheduleInterviewDto {
  @ApiProperty({ enum: InterviewMode })
  @IsEnum(InterviewMode)
  mode: InterviewMode;

  @ApiProperty({ example: '2026-08-01T10:00:00.000Z' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ description: 'Required when mode is IN_PERSON' })
  @ValidateIf((o) => o.mode === InterviewMode.IN_PERSON)
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Required when mode is VIRTUAL', example: 'https://meet.google.com/abc-defg-hij' })
  @ValidateIf((o) => o.mode === InterviewMode.VIRTUAL)
  @IsUrl()
  meetingUrl?: string;

  @ApiProperty({ example: 'Tolu Adeyemi' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => toTrimmedString(value))
  interviewerName: string;

  @ApiPropertyOptional({ example: 'Bring a valid means of ID' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTrimmedString(value))
  note?: string;
}