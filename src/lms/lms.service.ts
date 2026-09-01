import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { UpsertLmsCourseDto } from './dto/upsert-lms-course.dto';
import { sanitizeLmsHtml } from '../common/utils/lms-sanitize.util';

// Long enough to load a viewer page and start playback/reading; short
// enough that a saved or shared link goes stale quickly. This is a
// mitigation, not a guarantee -- see the note given alongside this
// feature's design: true, unbypassable download-prevention isn't
// achievable with presigned URLs against a technically determined user.
const CONTENT_URL_EXPIRY_SECONDS = 300;

type CourseFiles = { video?: Express.Multer.File[]; pdf?: Express.Multer.File[] };

@Injectable()
export class LmsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3Service: S3Service,
    ) { }

    /**
     * dto.isActive is always a raw string here ('true'/'false') or
     * undefined -- see the DTO's own comment for why this is parsed by
     * hand rather than left to class-transformer.
     */
    private parseIsActive(value: string | undefined, fallback: boolean): boolean {
        if (value === undefined) return fallback;
        return value === 'true';
    }

    // ── Admin ────────────────────────────────────────────────────────────

    async findAllAdmin() {
        return this.prisma.lmsCourse.findMany({
            orderBy: { createdAt: 'desc' },
            include: { roles: { include: { adminRole: { select: { id: true, name: true } } } } },
        });
    }

    async findOneAdmin(id: string) {
        const course = await this.prisma.lmsCourse.findUnique({
            where: { id },
            include: { roles: { include: { adminRole: { select: { id: true, name: true } } } } },
        });
        if (!course) throw new NotFoundException('Course not found');
        return {
            ...course,
            videoUrl: course.videoKey ? await this.s3Service.getPresignedUrl(course.videoKey, CONTENT_URL_EXPIRY_SECONDS) : null,
            pdfUrl: course.pdfKey ? await this.s3Service.getPresignedUrl(course.pdfKey, CONTENT_URL_EXPIRY_SECONDS) : null,
        };
    }

    async create(dto: UpsertLmsCourseDto, files: CourseFiles, createdById?: string) {
        const videoKey = files.video?.[0]
            ? await this.s3Service.uploadObject(files.video[0].buffer, 'lms/videos', files.video[0].originalname, files.video[0].mimetype)
            : undefined;
        const pdfKey = files.pdf?.[0]
            ? await this.s3Service.uploadObject(files.pdf[0].buffer, 'lms/pdfs', files.pdf[0].originalname, files.pdf[0].mimetype)
            : undefined;

        return this.prisma.lmsCourse.create({
            data: {
                title: dto.title,
                description: sanitizeLmsHtml(dto.description),
                videoKey,
                pdfKey,
                isActive: this.parseIsActive(dto.isActive, true),
                createdById,
                roles: { create: dto.roleIds.map((adminRoleId) => ({ adminRoleId })) },
            },
            include: { roles: true },
        });
    }

    async update(id: string, dto: UpsertLmsCourseDto, files: CourseFiles) {
        const existing = await this.prisma.lmsCourse.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Course not found');

        // A newly uploaded file replaces the old one -- the old S3 object
        // is orphaned intentionally rather than deleted here, matching
        // this codebase's existing convention elsewhere (e.g. passport
        // photo replacement) of not hard-deleting storage objects inline
        // with a write, to avoid data loss if the write itself fails
        // partway through.
        const videoKey = files.video?.[0]
            ? await this.s3Service.uploadObject(files.video[0].buffer, 'lms/videos', files.video[0].originalname, files.video[0].mimetype)
            : existing.videoKey;
        const pdfKey = files.pdf?.[0]
            ? await this.s3Service.uploadObject(files.pdf[0].buffer, 'lms/pdfs', files.pdf[0].originalname, files.pdf[0].mimetype)
            : existing.pdfKey;

        return this.prisma.lmsCourse.update({
            where: { id },
            data: {
                title: dto.title,
                description: sanitizeLmsHtml(dto.description),
                videoKey,
                pdfKey,
                isActive: this.parseIsActive(dto.isActive, existing.isActive),
                roles: {
                    deleteMany: {},
                    create: dto.roleIds.map((adminRoleId) => ({ adminRoleId })),
                },
            },
            include: { roles: true },
        });
    }

    async remove(id: string) {
        const existing = await this.prisma.lmsCourse.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Course not found');
        await this.prisma.lmsCourse.delete({ where: { id } });
        return { id };
    }

    // ── Staff-facing ─────────────────────────────────────────────────────

    /**
     * Same union AuthService.getPermissionsForUser computes at login:
     * primary User.adminRoleId plus every UserAdminRole secondary role.
     * Deliberately a small, self-contained query here rather than a
     * dependency on AuthService, to avoid a cross-module coupling this
     * feature doesn't otherwise need.
     */
    private async getEffectiveRoleIds(userId: string): Promise<string[]> {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { adminRoleId: true } });
        const secondary = await this.prisma.userAdminRole.findMany({ where: { userId }, select: { adminRoleId: true } });
        const ids = new Set<string>(secondary.map((r) => r.adminRoleId));
        if (user?.adminRoleId) ids.add(user.adminRoleId);
        return Array.from(ids);
    }

    async getMyCourses(userId: string) {
        const roleIds = await this.getEffectiveRoleIds(userId);
        if (roleIds.length === 0) return [];

        // List view -- metadata only, no presigned URLs generated here.
        // Generating one per course on a list a staff member may never
        // open would be wasted work; URLs are only ever minted when a
        // specific course is actually opened, in getMyCourse below.
        return this.prisma.lmsCourse.findMany({
            where: { isActive: true, roles: { some: { adminRoleId: { in: roleIds } } } },
            select: { id: true, title: true, description: true, videoKey: true, pdfKey: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getMyCourse(userId: string, courseId: string) {
        const roleIds = await this.getEffectiveRoleIds(userId);
        const course = await this.prisma.lmsCourse.findUnique({ where: { id: courseId }, include: { roles: true } });

        if (!course || !course.isActive) throw new NotFoundException('Course not found');

        // Re-checked here, not just trusted from the list this staff
        // member saw earlier -- same reasoning as every branch-ownership
        // check elsewhere in this codebase: never assume the UI already
        // enforced access, always re-verify server-side.
        const hasAccess = course.roles.some((r) => roleIds.includes(r.adminRoleId));
        if (!hasAccess) throw new ForbiddenException('You do not have access to this course');

        return {
            id: course.id,
            title: course.title,
            description: course.description,
            videoUrl: course.videoKey ? await this.s3Service.getPresignedUrl(course.videoKey, CONTENT_URL_EXPIRY_SECONDS) : null,
            pdfUrl: course.pdfKey ? await this.s3Service.getPresignedUrl(course.pdfKey, CONTENT_URL_EXPIRY_SECONDS) : null,
        };
    }
}