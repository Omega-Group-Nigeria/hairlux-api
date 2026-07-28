import { Module } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { StaffLeaveController } from './staff-leave.controller';
import { AdminLeaveController } from './admin-leave.controller';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [StaffModule],
  controllers: [StaffLeaveController, AdminLeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule { }