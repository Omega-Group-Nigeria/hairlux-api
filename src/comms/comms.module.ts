import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FcmModule } from '../beautician/fcm/fcm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../beautician/realtime/realtime.module';
import { CommsConfigService } from './services/comms-config.service';
import { AdminCommsController } from './admin-comms.controller';
import { CommsController } from './comms.controller';
import { CommsWebhookController } from './comms-webhook.controller';
import { CommsAdminService } from './services/comms-admin.service';
import { CommsAccessService } from './services/comms-access.service';
import { CommsEventService } from './services/comms-event.service';
import { CommsPresenterService } from './services/comms-presenter.service';
import { CommsRealtimeService } from './services/comms-realtime.service';
import { CommsSessionService } from './services/comms-session.service';
import { CommsTokenService } from './services/comms-token.service';
import { StreamCallService } from './services/stream-call.service';
import { StreamChannelService } from './services/stream-channel.service';
import { StreamClientService } from './services/stream-client.service';
import { StreamVideoClientService } from './services/stream-video-client.service';
import { StreamUserSyncService } from './services/stream-user-sync.service';
import { StreamDeviceSyncService } from './services/stream-device-sync.service';
import { StreamWebhookService } from './services/stream-webhook.service';

@Module({
  imports: [ConfigModule, PrismaModule, FcmModule, RealtimeModule],
  controllers: [CommsController, CommsWebhookController, AdminCommsController],
  providers: [
    StreamClientService,
    StreamVideoClientService,
    StreamCallService,
    CommsTokenService,
    StreamUserSyncService,
    StreamChannelService,
    CommsAccessService,
    CommsConfigService,
    CommsAdminService,
    CommsEventService,
    CommsPresenterService,
    CommsRealtimeService,
    CommsSessionService,
    StreamDeviceSyncService,
    StreamWebhookService,
  ],
  exports: [
    CommsSessionService,
    CommsPresenterService,
    CommsRealtimeService,
    CommsAdminService,
    StreamDeviceSyncService,
  ],
})
export class CommsModule {}