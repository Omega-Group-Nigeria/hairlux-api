import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { StaffService } from './staff.service';
import { CreateCompanyDocumentDto } from './dto/create-company-document.dto';

type CompanyDocumentRecord = {
  id: string;
  type: string;
  version: number;
  title: string;
  contentUrl: string;
  isActive: boolean;
  createdAt: Date;
};

type AcknowledgmentRecord = {
  id: string;
  staffId: string;
  documentId: string;
  acknowledgedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

@Injectable()
export class CompanyDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffService: StaffService,
    private readonly s3Service: S3Service,
  ) {}

  private get documentModel() {
    return (
      this.prisma as unknown as {
        companyDocument: {
          findFirst(args: any): Promise<CompanyDocumentRecord | null>;
          findMany(args: any): Promise<CompanyDocumentRecord[]>;
          create(args: any): Promise<CompanyDocumentRecord>;
          update(args: any): Promise<CompanyDocumentRecord>;
        };
      }
    ).companyDocument;
  }

  private get acknowledgmentModel() {
    return (
      this.prisma as unknown as {
        staffDocumentAcknowledgment: {
          findFirst(args: any): Promise<AcknowledgmentRecord | null>;
          findMany(args: any): Promise<AcknowledgmentRecord[]>;
          create(args: any): Promise<AcknowledgmentRecord>;
        };
      }
    ).staffDocumentAcknowledgment;
  }

  /**
   * Creates a new version of a document and deactivates whatever was
   * previously active for that type. Prior versions are never deleted --
   * they stay in the table (isActive: false) so a staff member's historical
   * acknowledgment of an OLD version remains a truthful record of what they
   * actually agreed to, even after the handbook gets updated.
   */
  async createDocument(dto: CreateCompanyDocumentDto) {
    const currentActive = await this.documentModel.findFirst({
      where: { type: dto.type, isActive: true },
      orderBy: { version: 'desc' },
    });

    const nextVersion = (currentActive?.version ?? 0) + 1;

    if (currentActive) {
      await this.documentModel.update({
        where: { id: currentActive.id },
        data: { isActive: false },
      });
    }

    return this.documentModel.create({
      data: {
        type: dto.type,
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
    const docs = await this.documentModel.findMany({
      where: { isActive: true },
      orderBy: { type: 'asc' },
    });

    return Promise.all(
      docs.map(async (doc) => ({
        id: doc.id,
        type: doc.type,
        version: doc.version,
        title: doc.title,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
        viewUrl: await this.s3Service.getPresignedUrl(doc.contentUrl),
      })),
    );
  }

  /**
   * For a given staff member: every active document, plus whether they've
   * acknowledged it and when. Used by both the staff's own dashboard and
   * the admin view of a specific staff member's compliance status.
   */
  async getStaffDocumentStatus(staffId: string) {
    const activeDocs = await this.listActiveDocuments();
    const acknowledgments = await this.acknowledgmentModel.findMany({
      where: { staffId },
    });
    const ackByDocId = new Map(acknowledgments.map((a) => [a.documentId, a]));

    const items = activeDocs.map((doc) => ({
      documentId: doc.id,
      type: doc.type,
      title: doc.title,
      version: doc.version,
      viewUrl: doc.viewUrl,
      acknowledged: ackByDocId.has(doc.id),
      acknowledgedAt: ackByDocId.get(doc.id)?.acknowledgedAt ?? null,
    }));

    return {
      documents: items,
      allAcknowledged: items.length > 0 && items.every((i) => i.acknowledged),
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
    const doc = await this.documentModel.findFirst({ where: { id: documentId, isActive: true } });
    if (!doc) {
      throw new NotFoundException('Document not found or is no longer the active version');
    }

    const existing = await this.acknowledgmentModel.findFirst({
      where: { staffId, documentId },
    });
    if (existing) {
      throw new ConflictException('This document has already been acknowledged');
    }

    const acknowledgment = await this.acknowledgmentModel.create({
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