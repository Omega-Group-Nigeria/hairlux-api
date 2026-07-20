import { Module } from '@nestjs/common';
import { FcmModule } from '../../beautician/fcm/fcm.module';
import { PushMessageFactory } from './push-message.factory';
import { PushDispatchService } from './push-dispatch.service';

@Module({
  imports: [FcmModule],
  providers: [PushMessageFactory, PushDispatchService],
  exports: [PushMessageFactory, PushDispatchService],
})
export class PushModule {}
