import { IsEnum, IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterviewOutcome } from '@prisma/client';

export class RecordInterviewOutcomeDto {
  @ApiProperty({ enum: InterviewOutcome })
  @IsEnum(InterviewOutcome)
  outcome: InterviewOutcome;

  @ApiProperty({ description: 'Staff ID of the interviewer who conducted the interview' })
  @IsUUID()
  interviewerId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}