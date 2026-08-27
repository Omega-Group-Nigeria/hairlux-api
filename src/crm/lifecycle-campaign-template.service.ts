import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemAuditService } from '../common/services/system-audit.service';
import { UpsertLifecycleCampaignTemplateDto } from './dto/upsert-lifecycle-campaign-template.dto';

@Injectable()
export class LifecycleCampaignTemplateService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly systemAuditService: SystemAuditService,
    ) { }

    async findAll() {
        return this.prisma.lifecycleCampaignTemplate.findMany({
            orderBy: [{ targetLifecycle: 'asc' }, { channel: 'asc' }],
        });
    }

    async findOne(id: string) {
        const template = await this.prisma.lifecycleCampaignTemplate.findUnique({ where: { id } });
        if (!template) throw new NotFoundException('Campaign template not found');
        return template;
    }

    async create(dto: UpsertLifecycleCampaignTemplateDto, actorId?: string) {
        const existing = await this.prisma.lifecycleCampaignTemplate.findUnique({
            where: { targetLifecycle_channel: { targetLifecycle: dto.targetLifecycle, channel: dto.channel } },
        });
        if (existing) {
            throw new ConflictException(
                `A template for ${dto.targetLifecycle} on ${dto.channel} already exists — edit it instead of creating a duplicate.`,
            );
        }

        const created = await this.prisma.lifecycleCampaignTemplate.create({
            data: {
                targetLifecycle: dto.targetLifecycle,
                channel: dto.channel,
                isEnabled: dto.isEnabled ?? true,
                subject: dto.subject,
                bodyTemplate: dto.bodyTemplate,
                delayDays: dto.delayDays ?? 0,
                cooldownDays: dto.cooldownDays ?? 30,
            },
        });

        await this.systemAuditService.log({
            action: 'CAMPAIGN_TEMPLATE_CREATED',
            entityType: 'LifecycleCampaignTemplate',
            entityId: created.id,
            actorId,
            after: { targetLifecycle: created.targetLifecycle, channel: created.channel, isEnabled: created.isEnabled },
        });

        return created;
    }

    async update(id: string, dto: Partial<UpsertLifecycleCampaignTemplateDto>, actorId?: string) {
        const before = await this.findOne(id);
        const updated = await this.prisma.lifecycleCampaignTemplate.update({
            where: { id },
            data: {
                ...(dto.targetLifecycle !== undefined && { targetLifecycle: dto.targetLifecycle }),
                ...(dto.channel !== undefined && { channel: dto.channel }),
                ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
                ...(dto.subject !== undefined && { subject: dto.subject }),
                ...(dto.bodyTemplate !== undefined && { bodyTemplate: dto.bodyTemplate }),
                ...(dto.delayDays !== undefined && { delayDays: dto.delayDays }),
                ...(dto.cooldownDays !== undefined && { cooldownDays: dto.cooldownDays }),
            },
        });

        await this.systemAuditService.log({
            action: 'CAMPAIGN_TEMPLATE_UPDATED',
            entityType: 'LifecycleCampaignTemplate',
            entityId: id,
            actorId,
            before: { targetLifecycle: before.targetLifecycle, channel: before.channel, isEnabled: before.isEnabled, subject: before.subject },
            after: { targetLifecycle: updated.targetLifecycle, channel: updated.channel, isEnabled: updated.isEnabled, subject: updated.subject },
        });

        return updated;
    }

    async remove(id: string, actorId?: string) {
        const template = await this.findOne(id);
        await this.prisma.lifecycleCampaignTemplate.delete({ where: { id } });

        await this.systemAuditService.log({
            action: 'CAMPAIGN_TEMPLATE_DELETED',
            entityType: 'LifecycleCampaignTemplate',
            entityId: id,
            actorId,
            before: { targetLifecycle: template.targetLifecycle, channel: template.channel },
        });
    }
}