import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ProcessPayoutDto {
  @ApiProperty({ description: 'Payout request ID to mark as paid' })
  @IsUUID()
  payoutRequestId: string;
}