import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SiteStatsService } from './site-stats.service';

/**
 * Genuinely public, unauthenticated endpoint only -- the homepage
 * "Trusted by Thousands" strip. Kept as its own controller (rather than
 * a @Public() route bolted onto admin-site-stats.controller.ts) so there
 * is no risk of a public route being accidentally introduced into an
 * otherwise-authenticated controller by a future copy-paste, matching
 * the same reasoning already used for public-staff.controller.ts.
 */
@ApiTags('Public - Site Stats')
@Controller('stats')
export class PublicSiteStatsController {
    constructor(private readonly siteStatsService: SiteStatsService) { }

    @Public()
    @Get()
    @ApiOperation({ summary: 'Homepage "Trusted by Thousands" stats — no login required' })
    async getStats() {
        const data = await this.siteStatsService.getPublicStats();
        return { success: true, message: 'Retrieved successfully', data };
    }
}