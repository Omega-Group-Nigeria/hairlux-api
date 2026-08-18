import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { LifecycleCampaignTemplateService } from './lifecycle-campaign-template.service';
import { UpsertLifecycleCampaignTemplateDto } from './dto/upsert-lifecycle-campaign-template.dto';

@ApiTags('Admin - Lifecycle Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/lifecycle-campaigns/templates')
export class AdminLifecycleCampaignController {
    constructor(private readonly templateService: LifecycleCampaignTemplateService) { }

    @Get()
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_READ)
    @ApiOperation({ summary: 'List every lifecycle campaign template' })
    async findAll() {
        const data = await this.templateService.findAll();
        return { success: true, message: 'Templates retrieved successfully', data };
    }

    @Get(':id')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_READ)
    @ApiOperation({ summary: 'Get a single template' })
    async findOne(@Param('id') id: string) {
        const data = await this.templateService.findOne(id);
        return { success: true, message: 'Template retrieved successfully', data };
    }

    @Post()
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_MANAGE)
    @ApiOperation({ summary: 'Create a template for a (targetLifecycle, channel) pair' })
    async create(@Body() dto: UpsertLifecycleCampaignTemplateDto) {
        const data = await this.templateService.create(dto);
        return { success: true, message: 'Template created successfully', data };
    }

    @Patch(':id')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_MANAGE)
    @ApiOperation({ summary: 'Update a template' })
    async update(@Param('id') id: string, @Body() dto: Partial<UpsertLifecycleCampaignTemplateDto>) {
        const data = await this.templateService.update(id, dto);
        return { success: true, message: 'Template updated successfully', data };
    }

    @Delete(':id')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_MANAGE)
    @ApiOperation({ summary: 'Delete a template' })
    async remove(@Param('id') id: string) {
        await this.templateService.remove(id);
        return { success: true, message: 'Template deleted successfully' };
    }
}