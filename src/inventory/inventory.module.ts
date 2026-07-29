import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StaffInventoryController } from './staff-inventory.controller';
import { AdminInventoryController } from './admin-inventory.controller';
import { StaffModule } from '../staff/staff.module';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [StaffModule, MailModule],
    controllers: [StaffInventoryController, AdminInventoryController],
    providers: [InventoryService],
    exports: [InventoryService],
})
export class InventoryModule { }