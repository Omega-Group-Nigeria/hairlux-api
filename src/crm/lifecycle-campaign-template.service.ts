import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertLifecycleCampaignTemplateDto } from './dto/upsert-lifecycle-campaign-template.dto';

@Injectable()
export class LifecycleCampaignTemplateService {
    constructor(private readonly prisma: PrismaService) { }

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

    async create(dto: UpsertLifecycleCampaignTemplateDto) {
        const existing = await this.prisma.lifecycleCampaignTemplate.findUnique({
            where: { targetLifecycle_channel: { targetLifecycle: dto.targetLifecycle, channel: dto.channel } },
        });
        if (existing) {
            throw new ConflictException(
                `A template for ${dto.targetLifecycle} on ${dto.channel} already exists — edit it instead of creating a duplicate.`,
            );
        }

        return this.prisma.lifecycleCampaignTemplate.create({
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
    }

    async update(id: string, dto: Partial<UpsertLifecycleCampaignTemplateDto>) {
        await this.findOne(id);
        return this.prisma.lifecycleCampaignTemplate.update({
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
    }

    async remove(id: string) {
        await this.findOne(id);
        await this.prisma.lifecycleCampaignTemplate.delete({ where: { id } });
    }
}