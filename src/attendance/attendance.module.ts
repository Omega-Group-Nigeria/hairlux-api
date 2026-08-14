import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { StaffWorkCalendarService } from './staff-work-calendar.service';
import { AttendanceSummaryService } from './attendance-summary.service';
import { StaffAttendanceController } from './staff-attendance.controller';
import { StaffModule } from '../staff/staff.module';
import { LeaveModule } from '../leave/leave.module';
import { AdminAttendanceController } from './admin-attendance.controller';

@Module({
  imports: [StaffModule, LeaveModule],
  controllers: [StaffAttendanceController, AdminAttendanceController],
  providers: [AttendanceService, StaffWorkCalendarService, AttendanceSummaryService],
  exports: [AttendanceService, StaffWorkCalendarService, AttendanceSummaryService],
})
export class AttendanceModule { }