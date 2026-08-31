import { Controller, Get, Patch, Param, Body, Query, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LeaveService } from './leave.service';
import { QueryLeaveRequestDto } from './dto/query-leave-request.dto';
import { RejectLeaveRequestDto, ReassignLeaveRequestDto } from './dto/leave-request-action.dto';

@ApiTags('Admin - Leave')
@ApiBearerAuth('JWT-auth')
@Controller('admin/leave-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminLeaveController {
    constructor(private readonly leaveService: LeaveService) { }

    @Get()
    @ApiOperation({ summary: 'List leave requests, filterable by status/type/staff' })
    async findAll(@Query() query: QueryLeaveRequestDto) {
        const data = await this.leaveService.findAllAdmin(query);
        return { success: true, message: 'Leave requests retrieved successfully', data };
    }

    @Get('staff-options')
    @ApiOperation({ summary: 'Minimal active staff list for this page\'s own dropdowns -- Dev Feedback Round 6, item #22' })
    async listStaffOptions() {
        const data = await this.leaveService.listStaffOptions();
        return { success: true, message: 'Staff options retrieved successfully', data };
    }

    @Patch(':id/approve')
    @ApiOperation({ summary: 'Approve a leave/permission request' })
    @ApiParam({ name: 'id' })
    @ApiResponse({ status: 200, description: 'Leave request approved successfully' })
    async approve(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.leaveService.approve(id);
        return { success: true, message: 'Leave request approved successfully', data };
    }

    @Patch(':id/reject')
    @ApiOperation({ summary: 'Reject a leave/permission request' })
    @ApiParam({ name: 'id' })
    async reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectLeaveRequestDto) {
        const data = await this.leaveService.reject(id, dto);
        return { success: true, message: 'Leave request rejected successfully', data };
    }

    @Patch(':id/reassign')
    @ApiOperation({ summary: 'Reassign a pending leave/permission request to a different staff member -- Dev Feedback Round 6, item #22' })
    @ApiParam({ name: 'id' })
    @ApiResponse({ status: 200, description: 'Leave request reassigned successfully' })
    @ApiResponse({ status: 400, description: 'Request is not pending, or already assigned to that staff member' })
    @ApiResponse({ status: 404, description: 'Request or staff member not found' })
    async reassign(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignLeaveRequestDto) {
        const data = await this.leaveService.reassign(id, dto, req.user?.id);
        return { success: true, message: 'Leave request reassigned successfully', data };
    }
}