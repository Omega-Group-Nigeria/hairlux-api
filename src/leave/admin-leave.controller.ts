import { Controller, Get, Patch, Param, Body, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LeaveService } from './leave.service';
import { QueryLeaveRequestDto } from './dto/query-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/leave-request-action.dto';

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
}