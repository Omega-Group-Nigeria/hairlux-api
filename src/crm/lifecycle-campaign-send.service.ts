import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CommunicationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AfricasTalkingService } from '../sms/africas-talking.service';
import { PushNotificationService } from '../beautician/fcm/push-notification.service';
import { CommunicationProfileService, CommunicationSubject } from './communication-profile.service';
import { getCustomerVisitStats, getUserVisitStats, getCustomerTotalSpend, getUserTotalSpend, getCustomerClassificationThresholds, classifyCustomerValue } from '../common/utils/customer-status.util';

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

// Dev Feedback Round 4, item #8: job now polls every 15 minutes instead of
// once daily, so a template/step's optional send-time window can actually
// be honored without waiting up to 24h for the next run.
const POLLING_INTERVAL_MINUTES = 15;

/**
 * "At or after" semantics, not a narrow window -- once the configured
 * time-of-day has passed for today, stays eligible for the rest of the
 * day. Deliberately robust to a missed run (brief downtime, etc.): a
 * narrow window would silently push a missed send to tomorrow, which is
 * worse than sending a few minutes late on the next poll.
 */
function isPastSendTimeToday(sendHour: number | null, sendMinute: number | null, now: Date): boolean {
    if (sendHour === null || sendHour === undefined) return true; // no window configured -- unchanged, original behavior
    const configuredMinutesSinceMidnight = sendHour * 60 + (sendMinute ?? 0);
    const nowMinutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    return nowMinutesSinceMidnight >= configuredMinutesSinceMidnight;
}

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
     * Detection-only vs. send are deliberately two separate crons
     * (CustomerLifecycleService vs. this one) so a slow/failing send run
     * can never block tomorrow's detection from running on schedule.
     * A transition here is left UNPROCESSED (processedAt stays null) as
     * long as at least one matching, enabled template OR sequence step is
     * still waiting on its own delay/send-time window -- it gets picked
     * up again on a future run once that window passes, without
     * re-attempting whatever already has a send row (the unique
     * constraints on LifecycleCampaignSend/LifecycleCampaignSequenceSend
     * are the guard against ever double-sending).
     *
     * Dev Feedback Round 4, item #8: now runs every 15 minutes instead of
     * once daily, so per-template/per-step send-time windows can actually
     * be honored without a up-to-24h delay.
     */
    @Cron(`*/${POLLING_INTERVAL_MINUTES} * * * *`, { timeZone: 'Africa/Lagos' })
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
        const sequence = await this.prisma.lifecycleCampaignSequence.findFirst({
            where: { targetLifecycle: transition.toLifecycle, isEnabled: true },
            include: { steps: { orderBy: { stepOrder: 'asc' }, include: { template: true } } },
        });

        if (!templates.length && !sequence) {
            // Nothing configured for this lifecycle at all -- a terminal
            // state, not a "waiting" one. Never re-evaluated again unless an
            // admin later adds a matching template/sequence, which a fresh
            // transition would then pick up going forward.
            await this.prisma.customerLifecycleTransition.update({
                where: { id: transition.id },
                data: { processedAt: new Date() },
            });
            return 0;
        }

        const subject = await this.resolveSubject(transition);
        let attempts = 0;
        let anyStillWaiting = false;
        const now = new Date();

        // Dev Feedback Round 6, item #12: audienceSource is a free
        // comparison against the already-resolved subject -- checked
        // first. targetValue needs the subject's total spend, which is
        // only worth computing if at least one template in this batch
        // actually uses that filter (most won't).
        const needsValueTier = templates.some((t: any) => t.targetValue);
        let subjectValueTier: string | null = null;
        if (needsValueTier) {
            const spendMap = subject.type === 'customer'
                ? await getCustomerTotalSpend(this.prisma, [subject.id])
                : await getUserTotalSpend(this.prisma, [subject.id]);
            const thresholds = await getCustomerClassificationThresholds(this.prisma);
            subjectValueTier = classifyCustomerValue(spendMap.get(subject.id) ?? 0, thresholds.value);
        }

        for (const template of templates) {
            if (template.audienceSource && template.audienceSource.toLowerCase() !== subject.type) {
                continue; // this template doesn't target this subject's source at all -- not "waiting", just not applicable
            }
            if (template.targetValue && template.targetValue !== subjectValueTier) {
                continue; // subject's Value tier doesn't match this template's filter
            }

            const existing = await this.prisma.lifecycleCampaignSend.findUnique({
                where: { transitionId_templateId: { transitionId: transition.id, templateId: template.id } },
            });
            if (existing) continue; // already handled -- never re-attempt

            const daysSinceDetected = (now.getTime() - transition.detectedAt.getTime()) / 86400000;
            if (daysSinceDetected < template.delayDays || !isPastSendTimeToday(template.sendHour, template.sendMinute, now)) {
                anyStillWaiting = true;
                continue; // not yet time -- leave unhandled, re-check on a future run
            }

            attempts += 1;
            await this.attemptSend(transition, template, subject);
        }

        if (sequence) {
            const stepAttempted = await this.handleSequence(transition, sequence, subject, now);
            if (stepAttempted === 'attempted') attempts += 1;
            if (stepAttempted === 'waiting') anyStillWaiting = true;
            // 'complete' and 'skipped-cooldown-or-consent-terminal' contribute nothing further to wait on.
        }

        if (!anyStillWaiting) {
            await this.prisma.customerLifecycleTransition.update({
                where: { id: transition.id },
                data: { processedAt: new Date() },
            });
        }

        return attempts;
    }

    /**
     * Dev Feedback Round 4, item #9: advances one sequence by at most one
     * step per run. The next step's delay is measured from when the
     * PREVIOUS step was PROCESSED (createdAt on its send row -- always
     * set, sent or not), never from sentAt (null on a skip) -- otherwise a
     * consent-skipped or failed step would permanently stall every step
     * after it. Cooldown is sequence-level (re-running the whole sequence
     * too soon for the same person), checked once, up front, against the
     * most recent SENT step of this sequence for this subject -- not
     * per-step.
     */
    private async handleSequence(
        transition: PendingTransition,
        sequence: { id: string; cooldownDays: number; steps: { id: string; stepOrder: number; template: { channel: CommunicationChannel; subject: string | null; bodyTemplate: string } | null; delayAfterPreviousMinutes: number; sendHour: number | null; sendMinute: number | null }[] },
        subject: ResolvedSubject,
        now: Date,
    ): Promise<'attempted' | 'waiting' | 'complete' | 'terminal'> {
        if (!sequence.steps.length) return 'complete';

        const sends = await this.prisma.lifecycleCampaignSequenceSend.findMany({
            where: { transitionId: transition.id, sequenceId: sequence.id },
            orderBy: { createdAt: 'asc' },
        });
        const lastProcessed = sends[sends.length - 1];

        const nextStep = sequence.steps.find((s) => !sends.some((send: { stepId: string }) => send.stepId === s.id));
        if (!nextStep) return 'complete'; // every step already has a send row, whatever the outcome

        const recordSkip = (status: string) =>
            this.prisma.lifecycleCampaignSequenceSend.create({
                data: { transitionId: transition.id, sequenceId: sequence.id, stepId: nextStep.id, status },
            });

        // Dev Feedback Round 6, item #13: a step's content now comes from
        // its linked template, which uses onDelete: SetNull -- a step
        // whose template was later deleted has nothing to send. Skip and
        // move on rather than crash; the sequence still completes.
        if (!nextStep.template) {
            await recordSkip('SKIPPED_NO_TEMPLATE');
            return 'attempted';
        }

        // Cooldown check only applies before STEP 1 -- once a sequence has
        // begun for this transition, it always runs to completion; cooldown
        // governs whether a NEW run of the sequence starts, not whether an
        // in-progress one continues.
        if (nextStep.stepOrder === 1) {
            const commSubject = this.toCommunicationSubject(subject);
            const lastSentAnywhere = await this.prisma.lifecycleCampaignSequenceSend.findFirst({
                where: {
                    sequenceId: sequence.id,
                    status: 'SENT',
                    transition: subject.type === 'customer' ? { customerId: subject.id } : { userId: subject.id },
                },
                orderBy: { sentAt: 'desc' },
            });
            if (lastSentAnywhere?.sentAt) {
                const daysSinceLastSequenceSend = (now.getTime() - lastSentAnywhere.sentAt.getTime()) / 86400000;
                if (daysSinceLastSequenceSend < sequence.cooldownDays) {
                    await recordSkip('SKIPPED_COOLDOWN');
                    return 'terminal';
                }
            }
        }

        // Delay basis: step 1 counts from the lifecycle transition itself
        // (matching template semantics); step 2+ counts from when the
        // PREVIOUS step was processed, not the original transition -- this
        // is what makes it genuinely sequential rather than three parallel
        // delays off the same trigger.
        const delayBasisTime = nextStep.stepOrder === 1 ? transition.detectedAt : (lastProcessed?.createdAt ?? transition.detectedAt);
        const minutesSinceBasis = (now.getTime() - delayBasisTime.getTime()) / 60000;
        if (minutesSinceBasis < nextStep.delayAfterPreviousMinutes || !isPastSendTimeToday(nextStep.sendHour, nextStep.sendMinute, now)) {
            return 'waiting';
        }

        await this.attemptSequenceStep(transition, sequence.id, {
            id: nextStep.id, // the send record's stepId is the STEP's id, not the linked template's
            channel: nextStep.template.channel,
            subject: nextStep.template.subject,
            bodyTemplate: nextStep.template.bodyTemplate,
        }, subject);
        return 'attempted';
    }

    private async attemptSequenceStep(
        transition: PendingTransition,
        sequenceId: string,
        step: { id: string; channel: CommunicationChannel; subject: string | null; bodyTemplate: string },
        subject: ResolvedSubject,
    ) {
        const commSubject = this.toCommunicationSubject(subject);
        const recordSkip = (status: string) =>
            this.prisma.lifecycleCampaignSequenceSend.create({
                data: { transitionId: transition.id, sequenceId, stepId: step.id, status },
            });

        if (step.channel === CommunicationChannel.PUSH && subject.type === 'customer') {
            await recordSkip('SKIPPED_NO_CONTACT');
            return;
        }

        const canSend = await this.communicationProfileService.canSend(commSubject, step.channel);
        if (!canSend) {
            await recordSkip('SKIPPED_NO_CONSENT');
            return;
        }

        const stats = subject.type === 'customer'
            ? (await getCustomerVisitStats(this.prisma, [subject.id])).get(subject.id)
            : (await getUserVisitStats(this.prisma, [subject.id])).get(subject.id);
        const rendered = this.renderTemplate(step.bodyTemplate, subject, stats?.lastVisitDate ?? null);
        const messageWithFooter = this.appendUnsubscribeFooter(rendered, commSubject, step.channel);

        try {
            if (step.channel === CommunicationChannel.EMAIL) {
                if (!subject.email) { await recordSkip('SKIPPED_NO_CONTACT'); return; }
                await this.mailService.sendGenericEmail(subject.email, step.subject || 'Hairlux Salon & Spa', messageWithFooter);
            } else if (step.channel === CommunicationChannel.SMS) {
                if (!subject.phone) { await recordSkip('SKIPPED_NO_CONTACT'); return; }
                const sent = await this.smsService.sendSms(subject.phone, messageWithFooter);
                if (!sent) { await recordSkip('FAILED'); return; }
            } else if (step.channel === CommunicationChannel.PUSH) {
                await this.pushService.sendToUser(subject.id, { title: step.subject || 'Hairlux Salon & Spa', body: rendered });
            }

            await this.prisma.lifecycleCampaignSequenceSend.create({
                data: { transitionId: transition.id, sequenceId, stepId: step.id, status: 'SENT', sentAt: new Date() },
            });
            await this.communicationProfileService.recordDeliveryStatus(commSubject, step.channel, 'SENT');
        } catch (err) {
            this.logger.error(
                `Lifecycle campaign sequence send failed (transition ${transition.id}, step ${step.id}): ${err instanceof Error ? err.message : String(err)}`,
            );
            await recordSkip('FAILED');
        }
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