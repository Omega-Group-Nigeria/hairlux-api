import { Controller, Get, Patch, Post, Param, Body, Query, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { AttendanceService } from './attendance.service';
import { StaffWorkCalendarService } from './staff-work-calendar.service';
import { AttendanceSummaryService } from './attendance-summary.service';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { UpdateLatePenaltySettingsDto } from './dto/update-late-penalty-settings.dto';
import { SetStaffWorkCalendarDto } from './dto/set-staff-work-calendar.dto';
import { DecideExtraWorkDayDto } from './dto/decide-extra-work-day.dto';

@ApiTags('Admin - Attendance')
@ApiBearerAuth('JWT-auth')
@Controller('admin/attendance')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminAttendanceController {
    constructor(
        private readonly attendanceService: AttendanceService,
        private readonly workCalendarService: StaffWorkCalendarService,
        private readonly summaryService: AttendanceSummaryService,
    ) { }

    @Get('summary/:staffId')
    @ApiOperation({ summary: 'Monthly attendance summary for one staff member — expected/worked/absent days, late arrivals, leave, extra work days' })
    @ApiParam({ name: 'staffId' })
    @ApiQuery({ name: 'periodStart', description: 'YYYY-MM-DD' })
    @ApiQuery({ name: 'periodEnd', description: 'YYYY-MM-DD' })
    @Permission(PERMISSIONS.ATTENDANCE_VIEW_REPORTS)
    async getStaffSummary(
        @Param('staffId', ParseUUIDPipe) staffId: string,
        @Query('periodStart') periodStart: string,
        @Query('periodEnd') periodEnd: string,
    ) {
        const data = await this.summaryService.getMonthlySummary(staffId, periodStart, periodEnd);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('summary')
    @ApiOperation({ summary: 'Monthly attendance summary for every active staff member, optionally scoped to a branch' })
    @ApiQuery({ name: 'periodStart', description: 'YYYY-MM-DD' })
    @ApiQuery({ name: 'periodEnd', description: 'YYYY-MM-DD' })
    @ApiQuery({ name: 'branchId', required: false })
    @Permission(PERMISSIONS.ATTENDANCE_VIEW_REPORTS)
    async getAllStaffSummary(
        @Query('periodStart') periodStart: string,
        @Query('periodEnd') periodEnd: string,
        @Query('branchId') branchId?: string,
    ) {
        const data = await this.summaryService.getMonthlySummaryForAllStaff(periodStart, periodEnd, branchId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('work-calendar/:staffId')
    @ApiOperation({
        summary: "A staff member's weekly work calendar",
        description: 'Days not explicitly configured fall back to the company BusinessHours for that day of week.',
    })
    @ApiParam({ name: 'staffId' })
    @Permission(PERMISSIONS.STAFF_WORK_CALENDAR_READ)
    async getWorkCalendar(@Param('staffId', ParseUUIDPipe) staffId: string) {
        const data = await this.workCalendarService.getCalendar(staffId);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post('work-calendar/:staffId')
    @ApiOperation({
        summary: "Set a staff member's weekly work calendar",
        description: 'Send one entry per day being configured — up to all 7. Existing days not included are left unchanged.',
    })
    @ApiParam({ name: 'staffId' })
    @Permission(PERMISSIONS.STAFF_WORK_CALENDAR_MANAGE)
    async setWorkCalendar(@Param('staffId', ParseUUIDPipe) staffId: string, @Body() dto: SetStaffWorkCalendarDto) {
        const data = await this.workCalendarService.setCalendar(staffId, dto);
        return { success: true, message: 'Work calendar updated successfully', data };
    }

    @Post('work-calendar/:staffId/apply-business-hours-default')
    @ApiOperation({
        summary: "Seed a staff member's calendar from the company's current BusinessHours",
        description: 'Convenience action for onboarding — by default only fills in days not already explicitly configured for this staff member; pass overwrite=true to replace everything.',
    })
    @ApiParam({ name: 'staffId' })
    @Permission(PERMISSIONS.STAFF_WORK_CALENDAR_MANAGE)
    async applyBusinessHoursDefault(@Param('staffId', ParseUUIDPipe) staffId: string, @Query('overwrite') overwrite?: string) {
        const data = await this.workCalendarService.applyBusinessHoursDefault(staffId, overwrite === 'true');
        return { success: true, message: 'Default calendar applied successfully', data };
    }

    @Get('late-penalty-settings')
    @ApiOperation({
        summary: 'Get the late-penalty settings',
        description: 'Grace-period minutes live on Branches (and per-staff overrides) — this only covers the per-minute charge beyond that.',
    })
    @Permission(PERMISSIONS.ATTENDANCE_MANAGE_LATE_PENALTY)
    async getLatePenaltySettings() {
        const data = await this.attendanceService.getLatePenaltySettings();
        return { success: true, message: 'Late penalty settings retrieved successfully', data };
    }

    @Patch('late-penalty-settings')
    @ApiOperation({ summary: 'Update the late-penalty settings' })
    @Permission(PERMISSIONS.ATTENDANCE_MANAGE_LATE_PENALTY)
    async updateLatePenaltySettings(@Body() dto: UpdateLatePenaltySettingsDto) {
        const data = await this.attendanceService.upsertLatePenaltySettings(dto);
        return { success: true, message: 'Late penalty settings updated successfully', data };
    }

    @Get('extra-work-days')
    @ApiOperation({
        summary: 'Extra Work Day approval queue',
        description: 'Attendance records created by a clock-in on a day the staff member\'s own calendar marks OFF. Defaults to PENDING; pass status to view APPROVED/REJECTED history instead.',
    })
    @Permission(PERMISSIONS.ATTENDANCE_APPROVE_CORRECTION)
    async getExtraWorkDayQueue(
        @Query('branchId') branchId?: string,
        @Query('staffId') staffId?: string,
        @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED',
    ) {
        const data = await this.attendanceService.getExtraWorkDayQueue({ branchId, staffId, status });
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Patch('extra-work-days/:id/approve')
    @ApiOperation({ summary: 'Approve an Extra Work Day — makes it eligible for payroll inclusion' })
    @ApiParam({ name: 'id', description: 'Attendance record ID' })
    @Permission(PERMISSIONS.ATTENDANCE_APPROVE_CORRECTION)
    async approveExtraWorkDay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideExtraWorkDayDto, @Req() req: any) {
        const data = await this.attendanceService.decideExtraWorkDay(id, req.user.id, true, dto.note);
        return { success: true, message: 'Extra work day approved successfully', data };
    }

    @Patch('extra-work-days/:id/reject')
    @ApiOperation({ summary: 'Reject an Extra Work Day' })
    @ApiParam({ name: 'id', description: 'Attendance record ID' })
    @Permission(PERMISSIONS.ATTENDANCE_REJECT_CORRECTION)
    async rejectExtraWorkDay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideExtraWorkDayDto, @Req() req: any) {
        const data = await this.attendanceService.decideExtraWorkDay(id, req.user.id, false, dto.note);
        return { success: true, message: 'Extra work day rejected successfully', data };
    }

    @Get()
    @ApiOperation({ summary: 'List attendance records, filterable by staff/branch/date range' })
    @Permission(PERMISSIONS.ATTENDANCE_READ)
    async findAll(@Query() query: QueryAttendanceDto) {
        const data = await this.attendanceService.findAllAdmin(query);
        return { success: true, message: 'Attendance records retrieved successfully', data };
    }

    @Patch(':id/correct')
    @ApiOperation({
        summary: 'Manually correct an attendance record',
        description: 'Flags the record as manually adjusted, distinct from GPS-verified. A reason is required.',
    })
    @ApiParam({ name: 'id', description: 'Attendance record ID' })
    @ApiResponse({ status: 200, description: 'Attendance record corrected successfully' })
    @ApiResponse({ status: 404, description: 'Attendance record not found' })
    @Permission(PERMISSIONS.ATTENDANCE_EDIT_RECORD)
    async correct(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CorrectAttendanceDto,
        @Req() req: any,
    ) {
        const data = await this.attendanceService.correctRecord(id, dto, req.user.id);
        return { success: true, message: 'Attendance record corrected successfully', data };
    }
}