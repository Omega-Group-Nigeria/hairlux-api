import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { StaffService } from './staff.service';

/**
 * Genuinely public, unauthenticated endpoints only -- currently just the
 * ID-card QR verification lookup. Kept as its own controller (rather than
 * a @Public() route bolted onto admin-staff.controller.ts or
 * staff-self.controller.ts) so there is no risk of a public route being
 * accidentally introduced into an otherwise-authenticated controller by a
 * future copy-paste.
 */
@ApiTags('Public - Staff Verification')
@Controller('staff/verify')
export class PublicStaffController {
    constructor(private readonly staffService: StaffService) { }

    @Public()
    @Get(':staffCode')
    @ApiOperation({ summary: "Verify a staff member's ID card by scanning the QR code — no login required" })
    @ApiParam({ name: 'staffCode', example: 'HL-ACD-0012' })
    @ApiResponse({ status: 200, description: 'verified:false if not found or not currently ACTIVE/ON_LEAVE' })
    async verify(@Param('staffCode') staffCode: string) {
        const data = await this.staffService.verifyByStaffCode(staffCode);
        return { success: true, message: 'Checked successfully', data };
    }
}