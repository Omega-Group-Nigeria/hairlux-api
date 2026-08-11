import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MatchingModule } from '../matching/matching.module';
import { HomeServiceBookingService } from './home-service-booking.service';

@Module({
  imports: [PrismaModule, MatchingModule],
  providers: [HomeServiceBookingService],
  exports: [HomeServiceBookingService],
})
export class HomeServiceBookingModule {}
