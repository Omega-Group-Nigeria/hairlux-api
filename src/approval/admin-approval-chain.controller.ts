import { Body, Controller, Get, Param, ParseEnumPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApprovalRequestType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { ApprovalService } from './approval.service';
import { SetApprovalChainDto } from './dto/set-approval-chain.dto';

@ApiTags('Admin - Approval Chains')
@ApiBearerAuth('JWT-auth')
@Controller('admin/approval-chains')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class AdminApprovalChainController {
    constructor(private readonly approvalService: ApprovalService) { }

    @Get()
    @Permission(PERMISSIONS.APPROVAL_CHAINS_READ)
    @ApiOperation({ summary: 'List every request type that currently has a configured chain, with its full ordered stages' })
    async getAll() {
        const data = await this.approvalService.getAllChains();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get(':requestType')
    @Permission(PERMISSIONS.APPROVAL_CHAINS_READ)
    @ApiOperation({ summary: 'Get the configured chain for one request type -- empty array means it uses the default single-approver behavior' })
    @ApiParam({ name: 'requestType', enum: ApprovalRequestType })
    async getOne(@Param('requestType', new ParseEnumPipe(ApprovalRequestType)) requestType: ApprovalRequestType) {
        const data = await this.approvalService.getChainStages(requestType);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Put()
    @Permission(PERMISSIONS.APPROVAL_CHAINS_MANAGE)
    @ApiOperation({
        summary: 'Set the full approval chain for a request type',
        description: 'Replaces every existing stage for this request type in one call. An empty stages array removes the chain entirely, reverting to the default single-approver behavior for any new request submitted after this point -- requests already in flight keep whatever stage they were already on.',
    })
    async set(@Body() dto: SetApprovalChainDto) {
        const data = await this.approvalService.setChainStages(dto.requestType, dto.stages.map((s) => s.approverRoleId));
        return { success: true, message: 'Approval chain updated', data };
    }
}