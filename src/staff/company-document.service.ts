import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { StaffService } from './staff.service';
import { CreateCompanyDocumentDto } from './dto/create-company-document.dto';

@Injectable()
export class CompanyDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffService: StaffService,
    private readonly s3Service: S3Service,
  ) { }

  /**
   * Creates a new version of a document and deactivates whatever was
   * previously active for that type. Prior versions are never deleted --
   * they stay in the table (isActive: false) so a staff member's historical
   * acknowledgment of an OLD version remains a truthful record of what they
   * actually agreed to, even after the handbook gets updated.
   */
  async createDocument(dto: CreateCompanyDocumentDto) {
    const documentType = await this.prisma.documentType.findUnique({ where: { id: dto.documentTypeId } });
    if (!documentType) throw new BadRequestException('Document type not found');
    if (!documentType.isActive) throw new BadRequestException(`"${documentType.name}" has been deactivated -- reactivate it first if you need to add a new version`);

    const currentActive = await this.prisma.companyDocument.findFirst({
      where: { documentTypeId: dto.documentTypeId, isActive: true },
      orderBy: { version: 'desc' },
    });

    const nextVersion = (currentActive?.version ?? 0) + 1;

    if (currentActive) {
      await this.prisma.companyDocument.update({
        where: { id: currentActive.id },
        data: { isActive: false },
      });
    }

    return this.prisma.companyDocument.create({
      data: {
        documentTypeId: dto.documentTypeId,
        version: nextVersion,
        title: dto.title,
        contentUrl: dto.contentUrl,
        isActive: true,
      },
    });
  }

  /**
   * One active document per type -- what every staff member needs to
   * acknowledge. contentUrl stored on the row is actually an S3 KEY (private
   * bucket) -- never returned as-is. A fresh presigned viewUrl is generated
   * on every call instead, since presigned URLs expire and must never be
   * persisted as if they were permanent links.
   */
  async listActiveDocuments() {
    const docs = await this.prisma.companyDocument.findMany({
      where: { isActive: true },
      include: { documentType: { select: { id: true, name: true } } },
      orderBy: { documentType: { name: 'asc' } },
    });

    return Promise.all(
      docs.map(async (doc: any) => ({
        id: doc.id,
        documentTypeId: doc.documentTypeId,
        typeName: doc.documentType.name,
        version: doc.version,
        title: doc.title,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
        viewUrl: await this.s3Service.getPresignedUrl(doc.contentUrl),
      })),
    );
  }

  /**
   * Dev Feedback Round 6, item #20. Only ever safe when nobody has
   * acknowledged this specific version yet -- otherwise deleting it would
   * destroy the historical record of what that staff member actually
   * agreed to (see createDocument's own comment above). In practice this
   * only ever fires for a just-uploaded, mistaken document: real,
   * in-use versions accumulate acknowledgments almost immediately.
   */
  async remove(id: string) {
    const doc = await this.prisma.companyDocument.findUnique({
      where: { id },
      include: { _count: { select: { acknowledgments: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc._count.acknowledgments > 0) {
      throw new ConflictException(
        `${doc._count.acknowledgments} staff member(s) have already acknowledged this document -- it can't be deleted without destroying that historical record. Upload a new version instead.`,
      );
    }
    await this.prisma.companyDocument.delete({ where: { id } });
    return { id };
  }

  /**
   * For a given staff member: every active document, plus whether they've
   * acknowledged it and when. Used by both the staff's own dashboard and
   * the admin view of a specific staff member's compliance status.
   */
  async getStaffDocumentStatus(staffId: string) {
    const activeDocs = await this.listActiveDocuments();
    const acknowledgments = await this.prisma.staffDocumentAcknowledgment.findMany({
      where: { staffId },
    });
    const ackByDocId = new Map(acknowledgments.map((a: any) => [a.documentId, a]));

    const items = activeDocs.map((doc: any) => ({
      documentId: doc.id,
      typeName: doc.typeName,
      title: doc.title,
      version: doc.version,
      viewUrl: doc.viewUrl,
      acknowledged: ackByDocId.has(doc.id),
      acknowledgedAt: (ackByDocId.get(doc.id) as any)?.acknowledgedAt ?? null,
    }));

    return {
      documents: items,
      allAcknowledged: items.length > 0 && items.every((i: any) => i.acknowledged),
    };
  }

  /**
   * Records acknowledgment of one document, with IP + user-agent capture --
   * this is the audit trail the original brief specifically asked for
   * ("timestamp and IP address of acceptance are recorded"). Re-acknowledging
   * an already-acknowledged document is a no-op conflict, not silently
   * overwritten, so the original acceptance timestamp is never lost.
   */
  async acknowledgeDocument(
    staffId: string,
    documentId: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
  ) {
    const doc = await this.prisma.companyDocument.findFirst({ where: { id: documentId, isActive: true } });
    if (!doc) {
      throw new NotFoundException('Document not found or is no longer the active version');
    }

    const existing = await this.prisma.staffDocumentAcknowledgment.findFirst({
      where: { staffId, documentId },
    });
    if (existing) {
      throw new ConflictException('This document has already been acknowledged');
    }

    const acknowledgment = await this.prisma.staffDocumentAcknowledgment.create({
      data: {
        staffId,
        documentId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    await this.staffService.checkAndCompletePolicyAcknowledgment(staffId);

    return acknowledgment;
  }
}