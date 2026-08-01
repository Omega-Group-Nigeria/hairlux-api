import { Controller, Get, Patch, Post, Param, Body, Query, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AttendanceService } from './attendance.service';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { UpdateLatePenaltySettingsDto } from './dto/update-late-penalty-settings.dto';

@ApiTags('Admin - Attendance')
@ApiBearerAuth('JWT-auth')
@Controller('admin/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminAttendanceController {
    constructor(private readonly attendanceService: AttendanceService) { }

    @Get('late-penalty-settings')
    @ApiOperation({
        summary: 'Get the late-penalty settings',
        description: 'Grace-period minutes live on Branches (and per-staff overrides) — this only covers the per-minute charge beyond that.',
    })
    async getLatePenaltySettings() {
        const data = await this.attendanceService.getLatePenaltySettings();
        return { success: true, message: 'Late penalty settings retrieved successfully', data };
    }

    @Patch('late-penalty-settings')
    @ApiOperation({ summary: 'Update the late-penalty settings' })
    async updateLatePenaltySettings(@Body() dto: UpdateLatePenaltySettingsDto) {
        const data = await this.attendanceService.upsertLatePenaltySettings(dto);
        return { success: true, message: 'Late penalty settings updated successfully', data };
    }

    @Get()
    @ApiOperation({ summary: 'List attendance records, filterable by staff/branch/date range' })
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
    async correct(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CorrectAttendanceDto,
        @Req() req: any,
    ) {
        const data = await this.attendanceService.correctRecord(id, dto, req.user.id);
        return { success: true, message: 'Attendance record corrected successfully', data };
    }
}