import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffModule } from '../staff/staff.module';
import { SiteStatsService } from './site-stats.service';
import { PublicSiteStatsController } from './public-site-stats.controller';
import { AdminSiteStatsController } from './admin-site-stats.controller';

@Module({
    imports: [PrismaModule, StaffModule],
    controllers: [PublicSiteStatsController, AdminSiteStatsController],
    providers: [SiteStatsService],
})
export class SiteStatsModule { }