import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FcmTokenService } from './fcm-token.service';
import { PushNotificationService } from './push-notification.service';

@Module({
  imports: [PrismaModule],
  providers: [FcmTokenService, PushNotificationService],
  exports: [FcmTokenService, PushNotificationService],
})
export class FcmModule {}