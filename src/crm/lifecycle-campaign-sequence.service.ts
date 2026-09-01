import { NotFoundException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemAuditService } from '../common/services/system-audit.service';
import { UpsertLifecycleCampaignSequenceDto } from './dto/upsert-lifecycle-campaign-sequence.dto';

@Injectable()
export class LifecycleCampaignSequenceService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly systemAuditService: SystemAuditService,
    ) { }

    async findAll() {
        return this.prisma.lifecycleCampaignSequence.findMany({
            include: { steps: { orderBy: { stepOrder: 'asc' }, include: { template: true } } },
            orderBy: { targetLifecycle: 'asc' },
        });
    }

    async findOne(id: string) {
        const sequence = await this.prisma.lifecycleCampaignSequence.findUnique({
            where: { id },
            include: { steps: { orderBy: { stepOrder: 'asc' }, include: { template: true } } },
        });
        if (!sequence) throw new NotFoundException('Campaign sequence not found');
        return sequence;
    }

    async create(dto: UpsertLifecycleCampaignSequenceDto, actorId?: string) {
        const created = await this.prisma.lifecycleCampaignSequence.create({
            data: {
                targetLifecycle: dto.targetLifecycle,
                name: dto.name,
                isEnabled: dto.isEnabled ?? true,
                cooldownDays: dto.cooldownDays ?? 30,
                steps: {
                    create: dto.steps.map((step, index) => ({
                        stepOrder: index + 1,
                        templateId: step.templateId,
                        delayAfterPreviousMinutes: step.delayAfterPreviousMinutes ?? 0,
                        sendHour: step.sendHour,
                        sendMinute: step.sendMinute,
                    })),
                },
            },
            include: { steps: { orderBy: { stepOrder: 'asc' }, include: { template: true } } },
        });

        await this.systemAuditService.log({
            action: 'CAMPAIGN_SEQUENCE_CREATED',
            entityType: 'LifecycleCampaignSequence',
            entityId: created.id,
            actorId,
            after: { targetLifecycle: created.targetLifecycle, name: created.name, isEnabled: created.isEnabled, stepCount: created.steps.length },
        });

        return created;
    }

    /**
     * Steps are always a full replace (delete every existing step, create
     * the new set), matching the DTO's own "full ordered replacement"
     * contract -- array position becomes stepOrder. This is a deliberate
     * trade-off: LifecycleCampaignSequenceSend rows cascade-delete along
     * with their step, so editing a sequence's steps clears send HISTORY
     * for those steps (an in-progress transition partway through the old
     * step set restarts from step 1 under the new one on its next run,
     * since findFirst-without-a-matching-send-row reads as "not started
     * yet"). Preserving history across an edited/reordered step set was
     * considered and rejected -- there's no reliable way to say which new
     * step an old send row "corresponds to" once steps have changed.
     */
    async update(id: string, dto: Partial<UpsertLifecycleCampaignSequenceDto>, actorId?: string) {
        const before = await this.findOne(id);

        await this.prisma.$transaction(async (tx) => {
            await tx.lifecycleCampaignSequence.update({
                where: { id },
                data: {
                    ...(dto.targetLifecycle !== undefined && { targetLifecycle: dto.targetLifecycle }),
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
                    ...(dto.cooldownDays !== undefined && { cooldownDays: dto.cooldownDays }),
                },
            });

            if (dto.steps !== undefined) {
                await tx.lifecycleCampaignSequenceStep.deleteMany({ where: { sequenceId: id } });
                await tx.lifecycleCampaignSequenceStep.createMany({
                    data: dto.steps.map((step, index) => ({
                        sequenceId: id,
                        stepOrder: index + 1,
                        templateId: step.templateId,
                        delayAfterPreviousMinutes: step.delayAfterPreviousMinutes ?? 0,
                        sendHour: step.sendHour,
                        sendMinute: step.sendMinute,
                    })),
                });
            }
        });

        const updated = await this.findOne(id);

        await this.systemAuditService.log({
            action: 'CAMPAIGN_SEQUENCE_UPDATED',
            entityType: 'LifecycleCampaignSequence',
            entityId: id,
            actorId,
            before: { targetLifecycle: before.targetLifecycle, name: before.name, isEnabled: before.isEnabled, stepCount: before.steps.length },
            after: { targetLifecycle: updated.targetLifecycle, name: updated.name, isEnabled: updated.isEnabled, stepCount: updated.steps.length },
        });

        return updated;
    }

    async remove(id: string, actorId?: string) {
        const sequence = await this.findOne(id);
        await this.prisma.lifecycleCampaignSequence.delete({ where: { id } });

        await this.systemAuditService.log({
            action: 'CAMPAIGN_SEQUENCE_DELETED',
            entityType: 'LifecycleCampaignSequence',
            entityId: id,
            actorId,
            before: { targetLifecycle: sequence.targetLifecycle, name: sequence.name },
        });
    }
}