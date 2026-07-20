import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { HomeServiceSharedModule } from '../home-service-booking/home-service-shared.module';
import { ArrivalPinService } from './services/arrival-pin.service';
import { ArrivalQrTokenService } from './services/arrival-qr-token.service';
import { ArrivalVerificationReadService } from './services/arrival-verification-read.service';
import { VerifyArrivalService } from './services/verify-arrival.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { CommsModule } from '../../comms/comms.module';
import { JobNotificationsModule } from '../../notifications/job/job-notifications.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ConfigModule,
    HomeServiceSharedModule,
    RealtimeModule,
    CommsModule,
    JobNotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret',
      }),
    }),
  ],
  providers: [
    ArrivalPinService,
    ArrivalQrTokenService,
    ArrivalVerificationReadService,
    VerifyArrivalService,
  ],
  exports: [
    ArrivalPinService,
    ArrivalQrTokenService,
    ArrivalVerificationReadService,
    VerifyArrivalService,
  ],
})
export class ArrivalVerificationModule {}