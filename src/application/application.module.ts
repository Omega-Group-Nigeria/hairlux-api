import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApplicationController } from './application.controller';
import { AdminApplicationController } from './admin-application.controller';
import { ApplicationService } from './application.service';
import { StaffModule } from '../staff/staff.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { ApplicantAuthGuard } from './guard/applicant-auth.guard';
import { StorageModule } from '../storage/storage.module';
import { NinModule } from '../nin/nin.module';

@Module({
  imports: [
    StaffModule,
    MailModule,
    AuthModule,
    StorageModule,
    NinModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('APPLICANT_JWT_SECRET'),
        signOptions: { expiresIn: '2h' },
      }),
    }),
  ],
  controllers: [ApplicationController, AdminApplicationController],
  providers: [ApplicationService, ApplicantAuthGuard],
  exports: [ApplicationService],
})
export class ApplicationModule {}