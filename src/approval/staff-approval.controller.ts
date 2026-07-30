import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StaffService } from '../staff/staff.service';
import { ApprovalService } from './approval.service';

@ApiTags('Staff - Approvals')
@ApiBearerAuth('JWT-auth')
@Controller('staff/me/approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffApprovalController {
    constructor(
        private readonly approvalService: ApprovalService,
        private readonly staffService: StaffService,
    ) { }

    @Get('pending')
    @ApiOperation({
        summary: 'Everything currently sitting in my approval queue, across all request types',
        description: 'A Branch Manager reviewing what needs their sign-off — Leave requests, Inventory adjustments, and future request types all show up here.',
    })
    async findPending(@Req() req: any) {
        const staff = await this.staffService.findByUserId(req.user.id);
        const data = await this.approvalService.findPendingForApprover(staff.id);
        return { success: true, message: 'Pending approvals retrieved successfully', data };
    }
}
