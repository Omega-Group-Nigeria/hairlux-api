import { Controller, Post, Get, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { StaffService } from '../staff/staff.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';

@ApiTags('Staff - Attendance')
@ApiBearerAuth('JWT-auth')
@Controller('staff/me/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffAttendanceController {
    constructor(
        private readonly attendanceService: AttendanceService,
        private readonly staffService: StaffService,
    ) { }

    @Post('check-in')
    @ApiOperation({ summary: 'Clock in — requires GPS coordinates within the branch\'s approved radius' })
    @ApiResponse({ status: 201, description: 'Clocked in successfully' })
    @ApiResponse({ status: 400, description: 'Outside GPS radius, or already clocked in today' })
    async checkIn(@Req() req: any, @Body() dto: ClockInDto) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.attendanceService.clockIn(staff.id, dto);
        return { success: true, message: 'Clocked in successfully', data };
    }

    @Post('check-out')
    @ApiOperation({ summary: 'Clock out — requires GPS coordinates within the branch\'s approved radius' })
    @ApiResponse({ status: 200, description: 'Clocked out successfully' })
    async checkOut(@Req() req: any, @Body() dto: ClockOutDto) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.attendanceService.clockOut(staff.id, dto);
        return { success: true, message: 'Clocked out successfully', data };
    }

    @Get()
    @ApiOperation({ summary: "Get the logged-in staff member's own attendance history" })
    async history(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.attendanceService.findMyHistory(staff.id, from, to);
        return { success: true, message: 'Attendance history retrieved successfully', data };
    }
}