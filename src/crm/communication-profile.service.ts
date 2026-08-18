import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CommunicationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CommunicationSubject = { customerId: string } | { userId: string };

export interface UnsubscribeTokenPayload {
    subjectType: 'customer' | 'user';
    subjectId: string;
    channel: CommunicationChannel;
}

// Per the product decision behind CustomerCommunicationProfile's schema
// comment: EMAIL and PUSH default to consented (an existing relationship,
// or an explicit OS-level permission grant, already implies consent);
// SMS defaults to NOT consented (more intrusive, real per-message cost --
// requires an explicit opt-in). Decided here in application code because
// a single DB column can't vary its default by another column's value.
const DEFAULT_CONSENT_BY_CHANNEL: Record<CommunicationChannel, boolean> = {
    EMAIL: true,
    SMS: false,
    PUSH: true,
};

@Injectable()
export class CommunicationProfileService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Deliberately signed with its OWN secret (UNSUBSCRIBE_TOKEN_SECRET),
     * never the main login-token secret -- an unsubscribe link sitting in
     * a two-year-old email needs to keep working indefinitely (no
     * expiresIn set), which is the opposite lifetime a login token should
     * ever have. Keeping the secrets separate also means rotating one
     * never has any effect on the other.
     */
    generateUnsubscribeToken(subject: CommunicationSubject, channel: CommunicationChannel): string {
        const payload: UnsubscribeTokenPayload = {
            subjectType: 'customerId' in subject ? 'customer' : 'user',
            subjectId: 'customerId' in subject ? subject.customerId : subject.userId,
            channel,
        };
        return this.jwtService.sign(payload, {
            secret: this.configService.get<string>('UNSUBSCRIBE_TOKEN_SECRET') || 'dev-only-fallback-unsubscribe-secret',
        });
    }

    verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload {
        try {
            return this.jwtService.verify<UnsubscribeTokenPayload>(token, {
                secret: this.configService.get<string>('UNSUBSCRIBE_TOKEN_SECRET') || 'dev-only-fallback-unsubscribe-secret',
            });
        } catch {
            throw new UnauthorizedException('This unsubscribe link is invalid or has expired.');
        }
    }

    private whereFor(subject: CommunicationSubject, channel: CommunicationChannel) {
        return 'customerId' in subject
            ? { customerId_channel: { customerId: subject.customerId, channel } }
            : { userId_channel: { userId: subject.userId, channel } };
    }

    /**
     * Creates the profile row with the correct channel-specific default the
     * first time it's ever checked for a given subject+channel -- so a
     * never-seen-before customer isn't wrongly treated as "no profile =
     * can't send" by canSend() below.
     */
    async getOrCreate(subject: CommunicationSubject, channel: CommunicationChannel) {
        const existing = await this.prisma.customerCommunicationProfile.findUnique({
            where: this.whereFor(subject, channel) as any,
        });
        if (existing) return existing;

        return this.prisma.customerCommunicationProfile.create({
            data: {
                ...('customerId' in subject ? { customerId: subject.customerId } : { userId: subject.userId }),
                channel,
                marketingConsent: DEFAULT_CONSENT_BY_CHANNEL[channel],
            },
        });
    }

    /** What the send pipeline actually calls before sending anything on a given channel. */
    async canSend(subject: CommunicationSubject, channel: CommunicationChannel): Promise<boolean> {
        const profile = await this.getOrCreate(subject, channel);
        return profile.marketingConsent;
    }

    async optOut(subject: CommunicationSubject, channel: CommunicationChannel, reason?: string) {
        await this.getOrCreate(subject, channel); // ensures the row exists before the upsert-style update below
        return this.prisma.customerCommunicationProfile.update({
            where: this.whereFor(subject, channel) as any,
            data: { marketingConsent: false, optedOutAt: new Date(), optedOutReason: reason ?? null },
        });
    }

    async optIn(subject: CommunicationSubject, channel: CommunicationChannel) {
        await this.getOrCreate(subject, channel);
        return this.prisma.customerCommunicationProfile.update({
            where: this.whereFor(subject, channel) as any,
            data: { marketingConsent: true, optedOutAt: null, optedOutReason: null },
        });
    }

    /** For the send pipeline to call after actually attempting delivery -- not yet called from anywhere until that pipeline exists. */
    async recordDeliveryStatus(subject: CommunicationSubject, channel: CommunicationChannel, status: string) {
        await this.getOrCreate(subject, channel);
        await this.prisma.customerCommunicationProfile.update({
            where: this.whereFor(subject, channel) as any,
            data: { lastDeliveryStatus: status, lastDeliveredAt: new Date() },
        });
    }
}