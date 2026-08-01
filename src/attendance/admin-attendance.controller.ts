import { Controller, Get, Patch, Post, Param, Body, Query, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AttendanceService } from './attendance.service';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';

@ApiTags('Admin - Attendance')
@ApiBearerAuth('JWT-auth')
@Controller('admin/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminAttendanceController {
    constructor(private readonly attendanceService: AttendanceService) { }

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