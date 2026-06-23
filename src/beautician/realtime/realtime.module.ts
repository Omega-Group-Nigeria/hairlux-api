import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { HomeServiceSharedModule } from '../home-service-booking/home-service-shared.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherService } from './realtime-publisher.service';
import { WsAuthService } from './ws-auth.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    PrismaModule,
    HomeServiceSharedModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret',
      }),
    }),
  ],
  providers: [RealtimeGateway, RealtimePublisherService, WsAuthService],
  exports: [RealtimePublisherService],
})
export class RealtimeModule {}