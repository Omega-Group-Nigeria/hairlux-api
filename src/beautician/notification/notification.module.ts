import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { FcmModule } from '../fcm/fcm.module';
import { BeauticianNotificationService } from './services/beautician-notification.service';

@Module({
  imports: [MailModule, FcmModule],
  providers: [BeauticianNotificationService],
  exports: [BeauticianNotificationService],
})
export class BeauticianNotificationModule {}