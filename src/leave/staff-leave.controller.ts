import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { LeaveService } from './leave.service';
import { StaffService } from '../staff/staff.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';

@ApiTags('Staff - Leave')
@ApiBearerAuth('JWT-auth')
@Controller('staff/me/leave-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffLeaveController {
    constructor(
        private readonly leaveService: LeaveService,
        private readonly staffService: StaffService,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Submit a leave or permission request' })
    async submit(@Req() req: any, @Body() dto: CreateLeaveRequestDto) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.leaveService.submit(staff.id, dto);
        return { success: true, message: 'Leave request submitted successfully', data };
    }

    @Get()
    @ApiOperation({ summary: "Get the logged-in staff member's own leave requests" })
    async findMy(@Req() req: any) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.leaveService.findMy(staff.id);
        return { success: true, message: 'Leave requests retrieved successfully', data };
    }
}