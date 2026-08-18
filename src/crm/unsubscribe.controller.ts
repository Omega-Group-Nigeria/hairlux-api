import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CommunicationProfileService, CommunicationSubject } from './communication-profile.service';

/**
 * Genuinely public, unauthenticated -- same reasoning as
 * PublicStaffController. Split GET/POST deliberately: GET only verifies
 * the token and reports who/what channel it's for (no side effect, safe
 * for email security scanners and link-preview bots to prefetch); the
 * actual opt-out only ever happens on POST, which only fires from an
 * explicit button click on the unsubscribe page.
 */
@ApiTags('Public - Unsubscribe')
@Controller('unsubscribe')
export class UnsubscribeController {
    constructor(private readonly communicationProfileService: CommunicationProfileService) { }

    @Public()
    @Get('verify')
    @ApiOperation({ summary: 'Verify an unsubscribe token and report what it would opt out of -- no side effect' })
    @ApiQuery({ name: 'token', required: true })
    async verify(@Query('token') token: string) {
        const payload = this.communicationProfileService.verifyUnsubscribeToken(token);
        return {
            success: true,
            message: 'Token verified',
            data: { channel: payload.channel },
        };
    }

    @Public()
    @Post()
    @ApiOperation({ summary: 'Actually opt out -- only ever called from an explicit button click, never from the verify link itself' })
    async unsubscribe(@Body('token') token: string) {
        const payload = this.communicationProfileService.verifyUnsubscribeToken(token);
        const subject: CommunicationSubject = payload.subjectType === 'customer'
            ? { customerId: payload.subjectId }
            : { userId: payload.subjectId };

        await this.communicationProfileService.optOut(subject, payload.channel, 'Self-service unsubscribe link');

        return { success: true, message: 'Unsubscribed successfully', data: { channel: payload.channel } };
    }
}