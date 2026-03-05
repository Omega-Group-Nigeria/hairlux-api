import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { AdminUserController } from './admin-user.controller';
import { UserService } from './user.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InfluencerModule } from '../influencer/influencer.module';

@Module({
  imports: [PrismaModule, InfluencerModule],
  controllers: [UserController, AdminUserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
