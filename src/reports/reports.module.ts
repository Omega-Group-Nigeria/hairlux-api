import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfitabilityReportService } from './profitability-report.service';
import { AdminReportsController } from './admin-reports.controller';

@Module({
    imports: [PrismaModule],
    controllers: [AdminReportsController],
    providers: [ProfitabilityReportService],
})
export class ReportsModule { }