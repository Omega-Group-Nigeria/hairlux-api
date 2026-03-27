import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { MailModule } from '../mail/mail.module';
import { StaffService } from './staff.service';
import { AdminStaffController } from './admin-staff.controller';

@Module({
  imports: [PrismaModule, RedisModule, MailModule],
  controllers: [AdminStaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
