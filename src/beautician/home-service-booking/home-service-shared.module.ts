import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { HomeServiceStatusService } from './home-service-status.service';
import { BookingParticipantService } from './services/booking-participant.service';
import { HomeServiceSettingsService } from '../services/home-service-settings.service';

@Module({
  imports: [PrismaModule],
  providers: [
    HomeServiceStatusService,
    BookingParticipantService,
    HomeServiceSettingsService,
  ],
  exports: [
    HomeServiceStatusService,
    BookingParticipantService,
    HomeServiceSettingsService,
  ],
})
export class HomeServiceSharedModule {}