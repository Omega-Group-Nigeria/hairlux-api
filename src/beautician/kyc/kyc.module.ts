import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { KycController } from './kyc.controller';
import { QoreidWebhookController } from './qoreid-webhook.controller';
import { QoreidSessionService } from './services/qoreid-session.service';
import { KycStatusService } from './services/kyc-status.service';
import { QoreidWebhookService } from './services/qoreid-webhook.service';
import { KycProfilePhotoService } from './services/kyc-profile-photo.service';
import { QoreidProfilePhotoProcessor } from './processors/qoreid-profile-photo.processor';
import { BeauticianNotificationModule } from '../notification/notification.module';
import { QOREID_PROFILE_PHOTO_QUEUE } from './constants/qoreid-profile-photo.constants';

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    RedisModule,
    CloudinaryModule,
    BeauticianNotificationModule,
    BullModule.registerQueue({ name: QOREID_PROFILE_PHOTO_QUEUE }),
  ],
  controllers: [KycController, QoreidWebhookController],
  providers: [
    QoreidSessionService,
    KycStatusService,
    QoreidWebhookService,
    KycProfilePhotoService,
    QoreidProfilePhotoProcessor,
  ],
  exports: [KycStatusService, QoreidSessionService],
})
export class KycModule {}
