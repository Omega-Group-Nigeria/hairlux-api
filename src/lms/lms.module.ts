import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { LmsService } from './lms.service';
import { AdminLmsController } from './admin-lms.controller';
import { StaffLmsController } from './staff-lms.controller';

@Module({
    imports: [PrismaModule, StorageModule],
    controllers: [AdminLmsController, StaffLmsController],
    providers: [LmsService],
    exports: [LmsService],
})
export class LmsModule { }