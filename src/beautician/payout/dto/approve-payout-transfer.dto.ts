import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ApprovePayoutTransferDto {
  @ApiProperty({ description: 'Payout request awaiting Paystack transfer approval' })
  @IsUUID()
  payoutRequestId: string;

  @ApiPropertyOptional({
    description: 'Paystack OTP when transfer status is otp',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  otp?: string;
}