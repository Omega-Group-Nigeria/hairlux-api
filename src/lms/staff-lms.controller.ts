import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LmsService } from './lms.service';

@ApiTags('Staff - LMS')
@ApiBearerAuth()
@Controller('lms/me')
@UseGuards(JwtAuthGuard)
export class StaffLmsController {
    constructor(private readonly lmsService: LmsService) { }

    @Get('courses')
    @ApiOperation({ summary: 'List courses visible to me, based on my own effective admin role(s)' })
    async getMyCourses(@Req() req: any) {
        const data = await this.lmsService.getMyCourses(req.user.id);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('courses/:id')
    @ApiOperation({ summary: 'View a course -- access is re-verified here, not just trusted from the list' })
    @ApiParam({ name: 'id' })
    async getMyCourse(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
        const data = await this.lmsService.getMyCourse(req.user.id, id);
        return { success: true, message: 'Retrieved successfully', data };
    }
}