import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { LifecycleCampaignTemplateService } from './lifecycle-campaign-template.service';
import { LifecycleCampaignSequenceService } from './lifecycle-campaign-sequence.service';
import { UpsertLifecycleCampaignTemplateDto } from './dto/upsert-lifecycle-campaign-template.dto';
import { UpsertLifecycleCampaignSequenceDto } from './dto/upsert-lifecycle-campaign-sequence.dto';

@ApiTags('Admin - Lifecycle Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/lifecycle-campaigns')
export class AdminLifecycleCampaignController {
    constructor(
        private readonly templateService: LifecycleCampaignTemplateService,
        private readonly sequenceService: LifecycleCampaignSequenceService,
    ) { }

    @Get('templates')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_READ)
    @ApiOperation({ summary: 'List every lifecycle campaign template' })
    async findAll() {
        const data = await this.templateService.findAll();
        return { success: true, message: 'Templates retrieved successfully', data };
    }

    @Get('templates/:id')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_READ)
    @ApiOperation({ summary: 'Get a single template' })
    async findOne(@Param('id') id: string) {
        const data = await this.templateService.findOne(id);
        return { success: true, message: 'Template retrieved successfully', data };
    }

    @Post('templates')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_MANAGE)
    @ApiOperation({ summary: 'Create a template for a (targetLifecycle, channel) pair' })
    async create(@Body() dto: UpsertLifecycleCampaignTemplateDto) {
        const data = await this.templateService.create(dto);
        return { success: true, message: 'Template created successfully', data };
    }

    @Patch('templates/:id')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_MANAGE)
    @ApiOperation({ summary: 'Update a template' })
    async update(@Param('id') id: string, @Body() dto: Partial<UpsertLifecycleCampaignTemplateDto>) {
        const data = await this.templateService.update(id, dto);
        return { success: true, message: 'Template updated successfully', data };
    }

    @Delete('templates/:id')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_MANAGE)
    @ApiOperation({ summary: 'Delete a template' })
    async remove(@Param('id') id: string) {
        await this.templateService.remove(id);
        return { success: true, message: 'Template deleted successfully' };
    }

    // ── Dev Feedback Round 4, item #9: sequences (multi-step, Email -> SMS -> Push with delays) ──

    @Get('sequences')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_READ)
    @ApiOperation({ summary: 'List every lifecycle campaign sequence, with its ordered steps' })
    async findAllSequences() {
        const data = await this.sequenceService.findAll();
        return { success: true, message: 'Sequences retrieved successfully', data };
    }

    @Get('sequences/:id')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_READ)
    @ApiOperation({ summary: 'Get a single sequence, with its ordered steps' })
    async findOneSequence(@Param('id') id: string) {
        const data = await this.sequenceService.findOne(id);
        return { success: true, message: 'Sequence retrieved successfully', data };
    }

    @Post('sequences')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_MANAGE)
    @ApiOperation({ summary: 'Create a sequence for a target lifecycle, with its ordered steps' })
    async createSequence(@Body() dto: UpsertLifecycleCampaignSequenceDto) {
        const data = await this.sequenceService.create(dto);
        return { success: true, message: 'Sequence created successfully', data };
    }

    @Patch('sequences/:id')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_MANAGE)
    @ApiOperation({
        summary: 'Update a sequence',
        description: 'Sending "steps" replaces the ENTIRE step list -- send every step that should remain, in order. Omit "steps" entirely to leave them untouched. Replacing steps clears send history for the old steps.',
    })
    async updateSequence(@Param('id') id: string, @Body() dto: Partial<UpsertLifecycleCampaignSequenceDto>) {
        const data = await this.sequenceService.update(id, dto);
        return { success: true, message: 'Sequence updated successfully', data };
    }

    @Delete('sequences/:id')
    @Permission(PERMISSIONS.LIFECYCLE_CAMPAIGNS_MANAGE)
    @ApiOperation({ summary: 'Delete a sequence and all its steps/send history' })
    async removeSequence(@Param('id') id: string) {
        await this.sequenceService.remove(id);
        return { success: true, message: 'Sequence deleted successfully' };
    }
}