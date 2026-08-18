import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sanitizeAnnouncementHtml } from '../common/utils/announcement-sanitize.util';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { AnnouncementTargetDto, CreateAnnouncementDto } from './dto/create-announcement.dto';
import { BulkCreateDirectivesDto, CreateDirectiveDto } from './dto/create-directive.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UpdateDirectiveDto } from './dto/update-directive.dto';

const DIRECTIVE_STATUS_ORDER = ['PENDING', 'ACKNOWLEDGED', 'COMPLETED'] as const;

export interface DirectiveFilters {
  status?: string;
  targetStaffId?: string;
  locationId?: string;
  dueBefore?: string;
  dueAfter?: string;
}

@Injectable()
export class StaffCommsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) { }

  private get announcementModel() {
    return (this.prisma as unknown as { announcement: any }).announcement;
  }
  private get announcementReadModel() {
    return (this.prisma as unknown as { announcementRead: any }).announcementRead;
  }
  private get directiveModel() {
    return (this.prisma as unknown as { directive: any }).directive;
  }
  private get staffModel() {
    return (this.prisma as unknown as { staff: any }).staff;
  }

  // -- Announcements --------------------------------------------------

  async createAnnouncement(dto: CreateAnnouncementDto, createdById?: string) {
    if (dto.target === AnnouncementTargetDto.BRANCH) {
      const location = await this.prisma.staffLocation.findUnique({
        where: { id: dto.targetLocationId },
      });
      if (!location) {
        throw new NotFoundException('targetLocationId does not match an existing branch');
      }
    }
    if (dto.target === AnnouncementTargetDto.INDIVIDUAL) {
      const staff = await this.staffModel.findFirst({ where: { id: dto.targetStaffId } });
      if (!staff) {
        throw new NotFoundException('targetStaffId does not match an existing staff record');
      }
    }

    return this.announcementModel.create({
      data: {
        title: dto.title,
        body: sanitizeAnnouncementHtml(dto.body),
        target: dto.target,
        targetLocationId: dto.target === AnnouncementTargetDto.BRANCH ? dto.targetLocationId : null,
        targetStaffId: dto.target === AnnouncementTargetDto.INDIVIDUAL ? dto.targetStaffId : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: createdById ?? null,
      },
    });
  }

  /**
   * Full edit — target, audience, expiry, title, body can all change.
   * Every field optional; only what's actually sent gets validated and
   * updated. Re-runs the same targetLocationId/targetStaffId existence
   * checks createAnnouncement enforces whenever the target actually
   * changes to something requiring one.
   */
  async updateAnnouncement(id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.announcementModel.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    const effectiveTarget = dto.target ?? existing.target;

    if (effectiveTarget === AnnouncementTargetDto.BRANCH) {
      const targetLocationId = dto.targetLocationId ?? existing.targetLocationId;
      if (!targetLocationId) {
        throw new BadRequestException('targetLocationId is required when target is BRANCH');
      }
      const location = await this.prisma.staffLocation.findUnique({ where: { id: targetLocationId } });
      if (!location) {
        throw new NotFoundException('targetLocationId does not match an existing branch');
      }
    }
    if (effectiveTarget === AnnouncementTargetDto.INDIVIDUAL) {
      const targetStaffId = dto.targetStaffId ?? existing.targetStaffId;
      if (!targetStaffId) {
        throw new BadRequestException('targetStaffId is required when target is INDIVIDUAL');
      }
      const staff = await this.staffModel.findFirst({ where: { id: targetStaffId } });
      if (!staff) {
        throw new NotFoundException('targetStaffId does not match an existing staff record');
      }
    }

    return this.announcementModel.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: sanitizeAnnouncementHtml(dto.body) }),
        ...(dto.target !== undefined && { target: dto.target }),
        ...(dto.target !== undefined && {
          targetLocationId: dto.target === AnnouncementTargetDto.BRANCH ? (dto.targetLocationId ?? existing.targetLocationId) : null,
          targetStaffId: dto.target === AnnouncementTargetDto.INDIVIDUAL ? (dto.targetStaffId ?? existing.targetStaffId) : null,
        }),
        ...(dto.expiresAt !== undefined && { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
      },
    });
  }

  async deleteAnnouncement(id: string) {
    const existing = await this.announcementModel.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }
    await this.announcementModel.delete({ where: { id } });
    return { deleted: true, id };
  }

  async getAllAnnouncements() {
    return this.announcementModel.findMany({
      where: {},
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        targetLocation: { select: { id: true, name: true, code: true } },
        targetStaff: { select: { id: true, name: true, staffCode: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /** Every announcement addressed to this staff member (ALL, their branch, or them individually), newest first. */
  async getAnnouncementsForStaff(staffId: string) {
    const staff = await this.staffModel.findFirst({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }

    const now = new Date();
    const announcements = await this.announcementModel.findMany({
      where: {
        AND: [
          {
            OR: [
              { target: 'ALL' },
              { target: 'BRANCH', targetLocationId: staff.locationId },
              { target: 'INDIVIDUAL', targetStaffId: staffId },
            ],
          },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const reads = await this.announcementReadModel.findMany({ where: { staffId } });
    const readIds = new Set(reads.map((r: { announcementId: string }) => r.announcementId));

    return announcements.map((a: { id: string }) => ({
      ...a,
      isRead: readIds.has(a.id),
    }));
  }

  async markAnnouncementRead(staffId: string, announcementId: string) {
    const existing = await this.announcementReadModel.findFirst({
      where: { staffId, announcementId },
    });
    if (existing) return existing; // idempotent -- re-marking read is a no-op, not an error

    return this.announcementReadModel.create({
      data: { staffId, announcementId },
    });
  }

  // -- Directives -------------------------------------------------------

  /**
   * Single-staff target creates one row. Branch target fans out to every
   * currently ACTIVE staff member at that branch, each getting their own
   * independent row -- so status never means "shared across a team",
   * always "this one person's response".
   */
  async createDirective(dto: CreateDirectiveDto, createdById?: string) {
    if (dto.targetStaffId) {
      const staff = await this.staffModel.findFirst({ where: { id: dto.targetStaffId } });
      if (!staff) {
        throw new NotFoundException('targetStaffId does not match an existing staff record');
      }
      return this.directiveModel.create({
        data: {
          title: dto.title,
          body: dto.body,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          targetStaffId: dto.targetStaffId,
          createdById: createdById ?? null,
        },
      });
    }

    const location = await this.prisma.staffLocation.findUnique({
      where: { id: dto.targetLocationId },
    });
    if (!location) {
      throw new NotFoundException('targetLocationId does not match an existing branch');
    }

    const activeStaff = await this.staffModel.findMany({
      where: { locationId: dto.targetLocationId, employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] } },
      select: { id: true },
    });

    if (activeStaff.length === 0) {
      throw new BadRequestException('No active staff found at this branch to send the directive to');
    }

    const created = await Promise.all(
      activeStaff.map((s: { id: string }) =>
        this.directiveModel.create({
          data: {
            title: dto.title,
            body: dto.body,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            targetStaffId: s.id,
            createdById: createdById ?? null,
          },
        }),
      ),
    );

    return { fannedOutTo: created.length, directives: created };
  }

  /**
   * Several distinct task definitions sent together in one action -- each
   * entry independently follows createDirective's own individual-or-branch
   * rule, so a batch can freely mix single-recipient and whole-branch tasks.
   * One entry failing (e.g. a bad targetLocationId) does not roll back the
   * others -- each result records success or its own error, since these are
   * genuinely independent tasks, not one atomic unit.
   */
  async bulkCreateDirectives(dto: BulkCreateDirectivesDto, createdById?: string) {
    const results = await Promise.allSettled(
      dto.tasks.map((task) => this.createDirective(task, createdById)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.status === 'rejected')
      .map(({ r, i }) => ({
        taskIndex: i,
        title: dto.tasks[i].title,
        error: (r as PromiseRejectedResult).reason?.message ?? 'Unknown error',
      }));

    return { succeededCount: succeeded, failedCount: failed.length, failed };
  }

  /**
   * Edits exactly one Directive row. A branch-fanned batch has no shared
   * parent identifier across its rows -- this always edits a single
   * person's task, never the original batch as a whole.
   */
  async updateDirective(directiveId: string, dto: UpdateDirectiveDto) {
    const directive = await this.directiveModel.findFirst({ where: { id: directiveId } });
    if (!directive) {
      throw new NotFoundException('Directive not found');
    }

    return this.directiveModel.update({
      where: { id: directiveId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
      },
    });
  }

  async deleteDirective(directiveId: string) {
    const directive = await this.directiveModel.findFirst({ where: { id: directiveId } });
    if (!directive) {
      throw new NotFoundException('Directive not found');
    }
    await this.directiveModel.delete({ where: { id: directiveId } });
    return { success: true };
  }

  async getDirectivesForStaff(staffId: string) {
    const staff = await this.staffModel.findFirst({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }

    return this.directiveModel.findMany({
      where: { targetStaffId: staffId },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin-wide view across all staff -- used by the Tasks & Directives admin page and the dashboard's HR Snapshot count. */
  async getAllDirectives(filters: DirectiveFilters = {}) {
    return this.directiveModel.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.targetStaffId && { targetStaffId: filters.targetStaffId }),
        ...(filters.locationId && { targetStaff: { locationId: filters.locationId } }),
        ...((filters.dueBefore || filters.dueAfter) && {
          dueDate: {
            ...(filters.dueAfter && { gte: new Date(filters.dueAfter) }),
            ...(filters.dueBefore && { lte: new Date(filters.dueBefore) }),
          },
        }),
      },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        targetStaff: { select: { id: true, name: true, staffCode: true, locationId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /**
   * Staff can only update their OWN directive, and can only move it
   * forward (PENDING -> ACKNOWLEDGED -> COMPLETED), never backward --
   * reopening a directive is an admin/management decision, not a staff one.
   */
  async updateDirectiveStatus(staffId: string, directiveId: string, newStatus: string) {
    const directive = await this.directiveModel.findFirst({ where: { id: directiveId } });
    if (!directive) {
      throw new NotFoundException('Directive not found');
    }
    if (directive.targetStaffId !== staffId) {
      throw new ForbiddenException('This directive was not sent to you');
    }

    const currentIndex = DIRECTIVE_STATUS_ORDER.indexOf(directive.status);
    const newIndex = DIRECTIVE_STATUS_ORDER.indexOf(newStatus as any);

    if (newIndex <= currentIndex) {
      throw new ConflictException(
        `Cannot move directive from ${directive.status} back to ${newStatus}`,
      );
    }

    return this.directiveModel.update({
      where: { id: directiveId },
      data: { status: newStatus, respondedAt: new Date() },
    });
  }

  /**
   * Optional proof of completion, submitted by the staff member themselves.
   * Same private-storage + presigned-URL-on-view convention as passport
   * photos -- never a permanent public link. Can be submitted independent
   * of the status-update call (multipart upload vs. plain JSON status
   * change), typically right around when the staff member marks the
   * directive COMPLETED.
   */
  async submitDirectiveEvidence(
    staffId: string,
    directiveId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const directive = await this.directiveModel.findFirst({ where: { id: directiveId } });
    if (!directive) {
      throw new NotFoundException('Directive not found');
    }
    if (directive.targetStaffId !== staffId) {
      throw new ForbiddenException('This directive was not sent to you');
    }

    const key = await this.s3Service.uploadObject(
      file.buffer,
      'directives/evidence',
      file.originalname,
      file.mimetype,
    );

    return this.directiveModel.update({
      where: { id: directiveId },
      data: { evidenceUrl: key },
    });
  }

  /** Fresh presigned view URL, generated on demand. Staff can view their own; admins can view any (see admin controller). */
  async getDirectiveEvidenceViewUrl(directiveId: string, requestingStaffId?: string) {
    const directive = await this.directiveModel.findFirst({ where: { id: directiveId } });
    if (!directive) {
      throw new NotFoundException('Directive not found');
    }
    if (requestingStaffId && directive.targetStaffId !== requestingStaffId) {
      throw new ForbiddenException('This directive was not sent to you');
    }
    if (!directive.evidenceUrl) return null;
    return this.s3Service.getPresignedUrl(directive.evidenceUrl);
  }
}