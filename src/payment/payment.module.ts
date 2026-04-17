import { Module } from '@nestjs/common';
import { PaystackService } from './paystack.service';
import { MonnifyService } from './monnify.service';

@Module({
  providers: [PaystackService, MonnifyService],
  exports: [PaystackService, MonnifyService],
})
export class PaymentModule {}
