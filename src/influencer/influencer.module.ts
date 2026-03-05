import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InfluencerService } from './influencer.service';
import { InfluencerController } from './influencer.controller';
import { AdminInfluencerController } from './admin-influencer.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InfluencerController, AdminInfluencerController],
  providers: [InfluencerService],
  exports: [InfluencerService],
})
export class InfluencerModule {}
