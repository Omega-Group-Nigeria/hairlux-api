import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { StaffService } from './staff.service';
import { CompanyDocumentService } from './company-document.service';
import { StaffCommsService } from './staff-comms.service';
import { StaffOperationsService } from './staff-operations.service';
import { AdminStaffController } from './admin-staff.controller';
import { StaffSelfController } from './staff-self.controller';
import { AdminCompanyDocumentController } from './admin-company-document.controller';
import { AdminStaffCommsController } from './admin-staff-comms.controller';
import { AdminStaffOperationsController } from './admin-staff-operations.controller';

@Module({
  imports: [PrismaModule, RedisModule, MailModule, AuthModule, StorageModule],
  controllers: [
    AdminStaffController,
    StaffSelfController,
    AdminCompanyDocumentController,
    AdminStaffCommsController,
    AdminStaffOperationsController,
  ],
  providers: [StaffService, CompanyDocumentService, StaffCommsService, StaffOperationsService],
  exports: [StaffService, CompanyDocumentService, StaffCommsService, StaffOperationsService],
})
export class StaffModule {}