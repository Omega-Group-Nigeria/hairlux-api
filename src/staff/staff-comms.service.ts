import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnnouncementTargetDto, CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateDirectiveDto } from './dto/create-directive.dto';

const DIRECTIVE_STATUS_ORDER = ['PENDING', 'ACKNOWLEDGED', 'COMPLETED'] as const;

@Injectable()
export class StaffCommsService {
  constructor(private readonly prisma: PrismaService) { }

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
        body: dto.body,
        target: dto.target,
        targetLocationId: dto.target === AnnouncementTargetDto.BRANCH ? dto.targetLocationId : null,
        targetStaffId: dto.target === AnnouncementTargetDto.INDIVIDUAL ? dto.targetStaffId : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: createdById ?? null,
      },
    });
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
            targetStaffId: s.id,
            createdById: createdById ?? null,
          },
        }),
      ),
    );

    return { fannedOutTo: created.length, directives: created };
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
  async getAllDirectives(filters: { status?: string } = {}) {
    return this.directiveModel.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
      },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        targetStaff: { select: { id: true, name: true, staffCode: true } },
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
}