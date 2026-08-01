import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutRequestStatus } from '@prisma/client';

export class AdminQueryPayoutsDto {
  @ApiPropertyOptional({
    description:
      'Filter by payout request status. Omit to return all statuses.',
    enum: PayoutRequestStatus,
    example: 'PENDING',
  })
  @IsOptional()
  @IsEnum(PayoutRequestStatus)
  status?: PayoutRequestStatus;
}