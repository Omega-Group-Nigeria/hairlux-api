import { NotFoundException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertLifecycleCampaignSequenceDto } from './dto/upsert-lifecycle-campaign-sequence.dto';

@Injectable()
export class LifecycleCampaignSequenceService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll() {
        return this.prisma.lifecycleCampaignSequence.findMany({
            include: { steps: { orderBy: { stepOrder: 'asc' } } },
            orderBy: { targetLifecycle: 'asc' },
        });
    }

    async findOne(id: string) {
        const sequence = await this.prisma.lifecycleCampaignSequence.findUnique({
            where: { id },
            include: { steps: { orderBy: { stepOrder: 'asc' } } },
        });
        if (!sequence) throw new NotFoundException('Campaign sequence not found');
        return sequence;
    }

    async create(dto: UpsertLifecycleCampaignSequenceDto) {
        return this.prisma.lifecycleCampaignSequence.create({
            data: {
                targetLifecycle: dto.targetLifecycle,
                name: dto.name,
                isEnabled: dto.isEnabled ?? true,
                cooldownDays: dto.cooldownDays ?? 30,
                steps: {
                    create: dto.steps.map((step, index) => ({
                        stepOrder: index + 1,
                        channel: step.channel,
                        subject: step.subject,
                        bodyTemplate: step.bodyTemplate,
                        delayAfterPreviousMinutes: step.delayAfterPreviousMinutes ?? 0,
                        sendHour: step.sendHour,
                        sendMinute: step.sendMinute,
                    })),
                },
            },
            include: { steps: { orderBy: { stepOrder: 'asc' } } },
        });
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
    async update(id: string, dto: Partial<UpsertLifecycleCampaignSequenceDto>) {
        await this.findOne(id);

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
                        channel: step.channel,
                        subject: step.subject,
                        bodyTemplate: step.bodyTemplate,
                        delayAfterPreviousMinutes: step.delayAfterPreviousMinutes ?? 0,
                        sendHour: step.sendHour,
                        sendMinute: step.sendMinute,
                    })),
                });
            }
        });

        return this.findOne(id);
    }

    async remove(id: string) {
        await this.findOne(id);
        await this.prisma.lifecycleCampaignSequence.delete({ where: { id } });
    }
}