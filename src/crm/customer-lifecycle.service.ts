import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserRole } from '@prisma/client';
import {
    classifyCustomerLifecycle,
    getCustomerClassificationThresholds,
    getCustomerVisitStats,
    getUserVisitStats,
} from '../common/utils/customer-status.util';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 300;

@Injectable()
export class CustomerLifecycleService {
    private readonly logger = new Logger(CustomerLifecycleService.name);

    constructor(private readonly prisma: PrismaService) { }

    @Cron('0 1 * * *', { timeZone: 'Africa/Lagos' })
    async detectLifecycleTransitions() {
        const startedAt = Date.now();
        const { lifecycle: thresholds } = await getCustomerClassificationThresholds(this.prisma);

        const customerResult = await this.detectForCustomers(thresholds);
        const userResult = await this.detectForUsers(thresholds);

        this.logger.log(
            `Lifecycle detection complete in ${Date.now() - startedAt}ms -- ` +
            `customers: ${customerResult.checked} checked, ${customerResult.transitions} transitions; ` +
            `users: ${userResult.checked} checked, ${userResult.transitions} transitions.`,
        );
    }

    private async detectForCustomers(thresholds: Awaited<ReturnType<typeof getCustomerClassificationThresholds>>['lifecycle']) {
        let checked = 0;
        let transitions = 0;
        let cursor: string | undefined;

        for (; ;) {
            const batch = await this.prisma.customer.findMany({
                take: BATCH_SIZE,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                orderBy: { id: 'asc' },
                select: { id: true, createdAt: true, lastKnownLifecycle: true },
            });
            if (!batch.length) break;
            cursor = batch[batch.length - 1].id;

            const visitStats = await getCustomerVisitStats(this.prisma, batch.map((c) => c.id));
            const now = new Date();

            for (const c of batch) {
                checked += 1;
                const stats = visitStats.get(c.id);
                const newLifecycle = classifyCustomerLifecycle({
                    lastVisitDate: stats?.lastVisitDate ?? null,
                    completedVisitCount: stats?.visitCount ?? 0,
                    accountCreatedAt: c.createdAt,
                    now,
                    thresholds,
                });

                if (c.lastKnownLifecycle && c.lastKnownLifecycle !== newLifecycle) {
                    await this.prisma.customerLifecycleTransition.create({
                        data: { customerId: c.id, fromLifecycle: c.lastKnownLifecycle, toLifecycle: newLifecycle },
                    });
                    transitions += 1;
                }

                await this.prisma.customer.update({
                    where: { id: c.id },
                    data: { lastKnownLifecycle: newLifecycle, lastLifecycleCheckedAt: now },
                });
            }

            if (batch.length < BATCH_SIZE) break;
        }

        return { checked, transitions };
    }

    private async detectForUsers(thresholds: Awaited<ReturnType<typeof getCustomerClassificationThresholds>>['lifecycle']) {
        let checked = 0;
        let transitions = 0;
        let cursor: string | undefined;

        for (; ;) {
            const batch = await this.prisma.user.findMany({
                take: BATCH_SIZE,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                where: { role: UserRole.USER },
                orderBy: { id: 'asc' },
                select: { id: true, createdAt: true, lastKnownLifecycle: true },
            });
            if (!batch.length) break;
            cursor = batch[batch.length - 1].id;

            const visitStats = await getUserVisitStats(this.prisma, batch.map((u) => u.id));
            const now = new Date();

            for (const u of batch) {
                checked += 1;
                const stats = visitStats.get(u.id);
                const newLifecycle = classifyCustomerLifecycle({
                    lastVisitDate: stats?.lastVisitDate ?? null,
                    completedVisitCount: stats?.visitCount ?? 0,
                    accountCreatedAt: u.createdAt,
                    now,
                    thresholds,
                });

                if (u.lastKnownLifecycle && u.lastKnownLifecycle !== newLifecycle) {
                    await this.prisma.customerLifecycleTransition.create({
                        data: { userId: u.id, fromLifecycle: u.lastKnownLifecycle, toLifecycle: newLifecycle },
                    });
                    transitions += 1;
                }

                await this.prisma.user.update({
                    where: { id: u.id },
                    data: { lastKnownLifecycle: newLifecycle, lastLifecycleCheckedAt: now },
                });
            }

            if (batch.length < BATCH_SIZE) break;
        }

        return { checked, transitions };
    }
}