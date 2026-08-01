import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ProcessPayoutDto {
  @ApiProperty({ description: 'Pending payout request ID to initiate Paystack transfer for' })
  @IsUUID()
  payoutRequestId: string;
}