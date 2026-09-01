import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditTrailService } from './audit-trail.service';
import { AdminAuditTrailController } from './admin-audit-trail.controller';

@Module({
    imports: [PrismaModule],
    controllers: [AdminAuditTrailController],
    providers: [AuditTrailService],
    exports: [AuditTrailService],
})
export class AuditTrailModule { }