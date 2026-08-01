import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { BeauticianNotificationService } from './services/beautician-notification.service';

@Module({
  imports: [MailModule],
  providers: [BeauticianNotificationService],
  exports: [BeauticianNotificationService],
})
export class BeauticianNotificationModule {}
