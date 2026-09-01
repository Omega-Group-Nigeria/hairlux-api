import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { AdminUserController } from './admin-user.controller';
import { UserService } from './user.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InfluencerModule } from '../influencer/influencer.module';
import { FcmModule } from '../beautician/fcm/fcm.module';
import { CommsModule } from '../comms/comms.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [PrismaModule, InfluencerModule, FcmModule, CommsModule, SmsModule],
  controllers: [UserController, AdminUserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
