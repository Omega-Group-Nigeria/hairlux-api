import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../prisma/prisma.module';
import { KycController } from './kyc.controller';
import { QoreidWebhookController } from './qoreid-webhook.controller';
import { QoreidSessionService } from './services/qoreid-session.service';
import { KycStatusService } from './services/kyc-status.service';
import { QoreidWebhookService } from './services/qoreid-webhook.service';
import { BeauticianNotificationModule } from '../notification/notification.module';

@Module({
  imports: [HttpModule, PrismaModule, BeauticianNotificationModule],
  controllers: [KycController, QoreidWebhookController],
  providers: [QoreidSessionService, KycStatusService, QoreidWebhookService],
  exports: [KycStatusService, QoreidSessionService],
})
export class KycModule {}