import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { FcmModule } from '../beautician/fcm/fcm.module';
import { CustomerLifecycleService } from './customer-lifecycle.service';
import { CommunicationProfileService } from './communication-profile.service';
import { LifecycleCampaignTemplateService } from './lifecycle-campaign-template.service';
import { LifecycleCampaignSendService } from './lifecycle-campaign-send.service';
import { AdminLifecycleCampaignController } from './admin-lifecycle-campaign.controller';
import { UnsubscribeController } from './unsubscribe.controller';

@Module({
    imports: [PrismaModule, MailModule, SmsModule, FcmModule, JwtModule.register({})],
    controllers: [AdminLifecycleCampaignController, UnsubscribeController],
    providers: [CustomerLifecycleService, CommunicationProfileService, LifecycleCampaignTemplateService, LifecycleCampaignSendService],
    exports: [CustomerLifecycleService, CommunicationProfileService, LifecycleCampaignTemplateService, LifecycleCampaignSendService],
})
export class CrmModule { }