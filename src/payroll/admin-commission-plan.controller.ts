import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { StaffService } from '../staff/staff.service';
import { CommissionPlanService } from './commission-plan.service';
import { CreateCommissionPlanDto } from './dto/create-commission-plan.dto';
import { UpdateCommissionPlanDto } from './dto/update-commission-plan.dto';
import { AssignCompensationDto } from './dto/assign-compensation.dto';

@ApiTags('Admin - Commission Plans')
@ApiBearerAuth('JWT-auth')
@Controller('admin/payroll/commission-plans')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminCommissionPlanController {
    constructor(
        private readonly commissionPlanService: CommissionPlanService,
        private readonly staffService: StaffService,
    ) { }

    @Get()
    @Permission(PERMISSIONS.PAYROLL_READ_COMMISSION_PLANS)
    @ApiQuery({ name: 'isActive', required: false, type: Boolean })
    @ApiQuery({ name: 'branchId', required: false })
    async findAll(@Query('isActive') isActive?: string, @Query('branchId') branchId?: string) {
        const data = await this.commissionPlanService.findAll({
            isActive: isActive === undefined ? undefined : isActive === 'true',
            branchId,
        });
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get(':id')
    @Permission(PERMISSIONS.PAYROLL_READ_COMMISSION_PLANS)
    @ApiParam({ name: 'id' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.commissionPlanService.findOne(id);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post()
    @Permission(PERMISSIONS.PAYROLL_CREATE_COMMISSION_PLAN)
    async create(@Req() req: any, @Body() dto: CreateCommissionPlanDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.commissionPlanService.create(dto, actor?.id);
        return { success: true, message: 'Commission plan created successfully', data };
    }

    @Patch('staff/:staffId/assign')
    @Permission(PERMISSIONS.PAYROLL_ASSIGN_COMMISSION_PLAN)
    @ApiOperation({ summary: "Assign a compensation type and/or Commission Plan to a staff member" })
    @ApiParam({ name: 'staffId' })
    async assignCompensation(@Req() req: any, @Param('staffId', ParseUUIDPipe) staffId: string, @Body() dto: AssignCompensationDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.commissionPlanService.assignCompensation(staffId, dto, actor?.id);
        return { success: true, message: 'Compensation assigned successfully', data };
    }

    // Deliberately declared BEFORE this -- Express/NestJS matches routes
    // in declaration order, and this generic :id pattern would otherwise
    // greedily match "staff/<staffId>/assign" as its own id parameter
    // first, shadowing the assignment endpoint entirely. The more
    // specific literal-prefix route must always come first.
    @Patch(':id')
    @Permission(PERMISSIONS.PAYROLL_UPDATE_COMMISSION_PLAN)
    @ApiParam({ name: 'id' })
    async update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommissionPlanDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.commissionPlanService.update(id, dto, actor?.id);
        return { success: true, message: 'Commission plan updated successfully', data };
    }

    @Delete(':id')
    @Permission(PERMISSIONS.PAYROLL_DELETE_COMMISSION_PLAN)
    @ApiParam({ name: 'id' })
    async remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        await this.commissionPlanService.remove(id, actor?.id);
        return { success: true, message: 'Commission plan deleted successfully' };
    }
}