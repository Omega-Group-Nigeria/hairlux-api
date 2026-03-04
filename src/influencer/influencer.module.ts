import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InfluencerService } from './influencer.service';
import { AdminInfluencerController } from './admin-influencer.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminInfluencerController],
  providers: [InfluencerService],
  exports: [InfluencerService],
})
export class InfluencerModule {}
