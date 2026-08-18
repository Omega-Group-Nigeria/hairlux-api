import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CommunicationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AfricasTalkingService } from '../sms/africas-talking.service';
import { PushNotificationService } from '../beautician/fcm/push-notification.service';
import { CommunicationProfileService, CommunicationSubject } from './communication-profile.service';
import { getCustomerVisitStats, getUserVisitStats } from '../common/utils/customer-status.util';

type ResolvedSubject = {
    type: 'customer' | 'user';
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
};

type PendingTransition = {
    id: string;
    customerId: string | null;
    userId: string | null;
    toLifecycle: string;
    detectedAt: Date;
};

const BATCH_SIZE = 200;

@Injectable()
export class LifecycleCampaignSendService {
    private readonly logger = new Logger(LifecycleCampaignSendService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mailService: MailService,
        private readonly smsService: AfricasTalkingService,
        private readonly pushService: PushNotificationService,
        private readonly communicationProfileService: CommunicationProfileService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Runs daily. Detection-only vs. send are deliberately two separate
     * crons (CustomerLifecycleService vs. this one) so a slow/failing send
     * run can never block tomorrow's detection from running on schedule.
     * A transition here is left UNPROCESSED (processedAt stays null) as
     * long as at least one matching, enabled template is still inside its
     * own delayDays window -- it gets picked up again on a future run
     * once that window passes, without re-attempting whatever already has
     * a LifecycleCampaignSend row (that unique constraint is the guard
     * against ever double-sending the same template for the same
     * transition).
     */
    @Cron('0 2 * * *', { timeZone: 'Africa/Lagos' })
    async processPendingTransitions() {
        const startedAt = Date.now();
        let cursor: string | undefined;
        let transitionsSeen = 0;
        let sendsAttempted = 0;

        for (; ;) {
            const batch = await this.prisma.customerLifecycleTransition.findMany({
                where: { processedAt: null },
                take: BATCH_SIZE,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                orderBy: { id: 'asc' },
                select: { id: true, customerId: true, userId: true, toLifecycle: true, detectedAt: true },
            });
            if (!batch.length) break;
            cursor = batch[batch.length - 1].id;
            transitionsSeen += batch.length;

            for (const transition of batch) {
                sendsAttempted += await this.handleTransition(transition);
            }

            if (batch.length < BATCH_SIZE) break;
        }

        this.logger.log(
            `Lifecycle campaign send run complete in ${Date.now() - startedAt}ms -- ` +
            `${transitionsSeen} pending transitions seen, ${sendsAttempted} send attempts made.`,
        );
    }

    /**
     * Returns the number of send attempts actually made (sent or
     * definitively skipped) for this transition, for logging.
     */
    private async handleTransition(transition: PendingTransition): Promise<number> {
        const templates = await this.prisma.lifecycleCampaignTemplate.findMany({
            where: { targetLifecycle: transition.toLifecycle, isEnabled: true },
        });

        if (!templates.length) {
            // No template configured for this lifecycle at all -- a terminal
            // state, not a "waiting" one. Never re-evaluated again unless an
            // admin later adds a matching template, which a fresh transition
            // would then pick up going forward.
            await this.prisma.customerLifecycleTransition.update({
                where: { id: transition.id },
                data: { processedAt: new Date() },
            });
            return 0;
        }

        const subject = await this.resolveSubject(transition);
        let attempts = 0;
        let anyStillWaiting = false;

        for (const template of templates) {
            const existing = await this.prisma.lifecycleCampaignSend.findUnique({
                where: { transitionId_templateId: { transitionId: transition.id, templateId: template.id } },
            });
            if (existing) continue; // already handled -- never re-attempt

            const daysSinceDetected = (Date.now() - transition.detectedAt.getTime()) / 86400000;
            if (daysSinceDetected < template.delayDays) {
                anyStillWaiting = true;
                continue; // not yet time -- leave unhandled, re-check on a future run
            }

            attempts += 1;
            await this.attemptSend(transition, template, subject);
        }

        if (!anyStillWaiting) {
            await this.prisma.customerLifecycleTransition.update({
                where: { id: transition.id },
                data: { processedAt: new Date() },
            });
        }

        return attempts;
    }

    private async resolveSubject(transition: PendingTransition): Promise<ResolvedSubject> {
        if (transition.customerId) {
            const c = await this.prisma.customer.findUniqueOrThrow({ where: { id: transition.customerId } });
            const [firstName, ...rest] = c.name.trim().split(/\s+/);
            return { type: 'customer', id: c.id, firstName: firstName || c.name, lastName: rest.join(' '), email: c.email, phone: c.phone };
        }
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: transition.userId! } });
        return { type: 'user', id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone };
    }

    private toCommunicationSubject(subject: ResolvedSubject): CommunicationSubject {
        return subject.type === 'customer' ? { customerId: subject.id } : { userId: subject.id };
    }

    private async attemptSend(
        transition: PendingTransition,
        template: { id: string; channel: CommunicationChannel; cooldownDays: number; subject: string | null; bodyTemplate: string },
        subject: ResolvedSubject,
    ) {
        const commSubject = this.toCommunicationSubject(subject);

        const recordSkip = (status: string) =>
            this.prisma.lifecycleCampaignSend.create({
                data: { transitionId: transition.id, templateId: template.id, status },
            });

        // PUSH is structurally impossible for a walk-in Customer -- FCM
        // tokens are only ever registered against a User account. Recorded
        // as an explicit skip (not silently excluded from matching) so an
        // admin reviewing send history sees exactly why it never went out,
        // rather than assuming it was simply never attempted.
        if (template.channel === CommunicationChannel.PUSH && subject.type === 'customer') {
            await recordSkip('SKIPPED_NO_CONTACT');
            return;
        }

        const lastSent = await this.prisma.lifecycleCampaignSend.findFirst({
            where: {
                templateId: template.id,
                status: 'SENT',
                transition: subject.type === 'customer' ? { customerId: subject.id } : { userId: subject.id },
            },
            orderBy: { sentAt: 'desc' },
        });
        if (lastSent?.sentAt) {
            const daysSinceLastSend = (Date.now() - lastSent.sentAt.getTime()) / 86400000;
            if (daysSinceLastSend < template.cooldownDays) {
                await recordSkip('SKIPPED_COOLDOWN');
                return;
            }
        }

        const canSend = await this.communicationProfileService.canSend(commSubject, template.channel);
        if (!canSend) {
            await recordSkip('SKIPPED_NO_CONSENT');
            return;
        }

        const stats = subject.type === 'customer'
            ? (await getCustomerVisitStats(this.prisma, [subject.id])).get(subject.id)
            : (await getUserVisitStats(this.prisma, [subject.id])).get(subject.id);
        const rendered = this.renderTemplate(template.bodyTemplate, subject, stats?.lastVisitDate ?? null);
        const messageWithFooter = this.appendUnsubscribeFooter(rendered, commSubject, template.channel);

        try {
            if (template.channel === CommunicationChannel.EMAIL) {
                if (!subject.email) { await recordSkip('SKIPPED_NO_CONTACT'); return; }
                await this.mailService.sendGenericEmail(subject.email, template.subject || 'Hairlux Salon & Spa', messageWithFooter);
            } else if (template.channel === CommunicationChannel.SMS) {
                if (!subject.phone) { await recordSkip('SKIPPED_NO_CONTACT'); return; }
                const sent = await this.smsService.sendSms(subject.phone, messageWithFooter);
                if (!sent) { await recordSkip('FAILED'); return; }
            } else if (template.channel === CommunicationChannel.PUSH) {
                // No unsubscribe footer on push -- the OS's own notification
                // settings already give a native, always-available opt-out,
                // and push bodies are short/device-truncated, where an
                // appended URL would just look broken.
                await this.pushService.sendToUser(subject.id, { title: template.subject || 'Hairlux Salon & Spa', body: rendered });
            }

            await this.prisma.lifecycleCampaignSend.create({
                data: { transitionId: transition.id, templateId: template.id, status: 'SENT', sentAt: new Date() },
            });
            await this.communicationProfileService.recordDeliveryStatus(commSubject, template.channel, 'SENT');
        } catch (err) {
            this.logger.error(
                `Lifecycle campaign send failed (transition ${transition.id}, template ${template.id}): ${err instanceof Error ? err.message : String(err)}`,
            );
            await recordSkip('FAILED');
        }
    }

    /**
     * EMAIL gets an HTML footer with a real link; SMS gets a short plain
     * URL appended (no SMS short-code/keyword infra exists, so a link is
     * the most practical option available). Token is single-purpose --
     * verifying it can only ever opt this exact subject out of this exact
     * channel, nothing else.
     */
    private appendUnsubscribeFooter(body: string, subject: CommunicationSubject, channel: CommunicationChannel): string {
        if (channel === CommunicationChannel.PUSH) return body;

        const token = this.communicationProfileService.generateUnsubscribeToken(subject, channel);
        const baseUrl = this.configService.get<string>('UNSUBSCRIBE_PAGE_URL') || 'https://hairlux.com.ng/unsubscribe.html';
        const url = `${baseUrl}?token=${encodeURIComponent(token)}`;

        if (channel === CommunicationChannel.EMAIL) {
            return `${body}<br><br><hr><p style="font-size:12px;color:#888;">Don't want emails like this? <a href="${url}">Unsubscribe here</a>.</p>`;
        }
        return `${body}\n\nUnsubscribe: ${url}`;
    }

    private renderTemplate(body: string, subject: ResolvedSubject, lastVisitDate: Date | null): string {
        return body
            .replace(/\{\{\s*firstName\s*\}\}/g, subject.firstName || '')
            .replace(/\{\{\s*lastName\s*\}\}/g, subject.lastName || '')
            .replace(/\{\{\s*lastVisitDate\s*\}\}/g, lastVisitDate ? lastVisitDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
    }
}