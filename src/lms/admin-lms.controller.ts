import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Req,
    UseGuards,
    UseInterceptors,
    UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { LmsService } from './lms.service';
import { UpsertLmsCourseDto } from './dto/upsert-lms-course.dto';

// Generous but bounded -- training videos are the largest files this
// endpoint handles; PDFs are comparatively tiny but share the same cap
// for simplicity.
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

@ApiTags('Admin - LMS')
@ApiBearerAuth()
@Controller('admin/lms/courses')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class AdminLmsController {
    constructor(private readonly lmsService: LmsService) { }

    @Get()
    @ApiOperation({ summary: 'List every course (active and inactive) for the admin management UI' })
    @Permission(PERMISSIONS.LMS_READ)
    async findAll() {
        const data = await this.lmsService.findAllAdmin();
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get one course with a preview URL for its video/PDF' })
    @ApiParam({ name: 'id' })
    @Permission(PERMISSIONS.LMS_READ)
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.lmsService.findOneAdmin(id);
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post()
    @ApiOperation({ summary: 'Create a course' })
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'video', maxCount: 1 },
        { name: 'pdf', maxCount: 1 },
    ], { limits: { fileSize: MAX_VIDEO_SIZE_BYTES } }))
    @Permission(PERMISSIONS.LMS_MANAGE)
    async create(
        @UploadedFiles() files: { video?: Express.Multer.File[]; pdf?: Express.Multer.File[] },
        @Body() dto: UpsertLmsCourseDto,
        @Req() req: any,
    ) {
        const data = await this.lmsService.create(dto, files || {}, req.user.id);
        return { success: true, message: 'Course created', data };
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a course -- a new video/pdf file replaces the old one, otherwise the existing file is kept' })
    @ApiParam({ name: 'id' })
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'video', maxCount: 1 },
        { name: 'pdf', maxCount: 1 },
    ], { limits: { fileSize: MAX_VIDEO_SIZE_BYTES } }))
    @Permission(PERMISSIONS.LMS_MANAGE)
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @UploadedFiles() files: { video?: Express.Multer.File[]; pdf?: Express.Multer.File[] },
        @Body() dto: UpsertLmsCourseDto,
    ) {
        const data = await this.lmsService.update(id, dto, files || {});
        return { success: true, message: 'Course updated', data };
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a course permanently' })
    @ApiParam({ name: 'id' })
    @Permission(PERMISSIONS.LMS_MANAGE)
    async remove(@Param('id', ParseUUIDPipe) id: string) {
        const data = await this.lmsService.remove(id);
        return { success: true, message: 'Course deleted', data };
    }
}