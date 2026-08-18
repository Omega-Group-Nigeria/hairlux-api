import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { NinModule } from '../nin/nin.module';
import { StaffService } from './staff.service';
import { CompanyDocumentService } from './company-document.service';
import { StaffCommsService } from './staff-comms.service';
import { StaffOperationsService } from './staff-operations.service';
import { StaffAddressVerificationService } from './staff-address-verification.service';
import { AdminStaffController } from './admin-staff.controller';
import { StaffSelfController } from './staff-self.controller';
import { AdminCompanyDocumentController } from './admin-company-document.controller';
import { AdminStaffCommsController } from './admin-staff-comms.controller';
import { AdminStaffOperationsController } from './admin-staff-operations.controller';
import { PublicStaffController } from './public-staff.controller';

@Module({
  imports: [PrismaModule, RedisModule, MailModule, AuthModule, StorageModule, NinModule],
  controllers: [
    AdminStaffController,
    StaffSelfController,
    AdminCompanyDocumentController,
    AdminStaffCommsController,
    AdminStaffOperationsController,
    PublicStaffController,
  ],
  providers: [StaffService, CompanyDocumentService, StaffCommsService, StaffOperationsService, StaffAddressVerificationService],
  exports: [StaffService, CompanyDocumentService, StaffCommsService, StaffOperationsService, StaffAddressVerificationService],
})
export class StaffModule { }