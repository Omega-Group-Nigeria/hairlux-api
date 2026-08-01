import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

const JOB_HISTORY_STATUSES = [
  BookingStatus.ASSIGNED,
  BookingStatus.EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.ARRIVED_VERIFIED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.AWAITING_CUSTOMER_CONFIRM,
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
] as const;

export class QueryJobHistoryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const raw = obj?.[key] ?? value;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return val ? parseInt(val, 10) : 1;
  })
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Transform(({ value, obj, key }) => {
    const raw = obj?.[key] ?? value;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return val ? parseInt(val, 10) : 20;
  })
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: JOB_HISTORY_STATUSES,
    description:
      'Filter by assigned job status. Omit to return all jobs assigned to the beautician.',
  })
  @IsOptional()
  @IsEnum(JOB_HISTORY_STATUSES)
  status?: (typeof JOB_HISTORY_STATUSES)[number];
}