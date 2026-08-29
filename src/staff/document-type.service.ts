import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemAuditService } from '../common/services/system-audit.service';

@Injectable()
export class DocumentTypeService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly systemAuditService: SystemAuditService,
    ) { }

    async findAll(activeOnly?: boolean) {
        return this.prisma.documentType.findMany({
            where: activeOnly ? { isActive: true } : undefined,
            orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        });
    }

    async create(name: string, actorId: string | undefined) {
        const trimmed = name.trim();
        const existing = await this.prisma.documentType.findUnique({ where: { name: trimmed } });
        if (existing) throw new BadRequestException(`"${trimmed}" already exists as a document type`);

        const type = await this.prisma.documentType.create({
            data: { name: trimmed, isSystem: false },
        });

        await this.systemAuditService.log({
            action: 'DOCUMENT_TYPE_CREATED',
            entityType: 'DocumentType',
            entityId: type.id,
            actorId,
            after: { name: type.name },
        });

        return type;
    }

    /**
     * Only isActive is editable -- name is never renamed in place (a
     * document type's name is what every past CompanyDocument/
     * acknowledgment record under it implicitly refers to; renaming would
     * silently rewrite what staff historically agreed to). Deactivating
     * instead of deleting is how a type is retired without breaking that
     * history.
     */
    async setActive(id: string, isActive: boolean, actorId: string | undefined) {
        const type = await this.prisma.documentType.findUnique({ where: { id } });
        if (!type) throw new NotFoundException('Document type not found');

        const updated = await this.prisma.documentType.update({ where: { id }, data: { isActive } });

        await this.systemAuditService.log({
            action: 'DOCUMENT_TYPE_STATUS_CHANGED',
            entityType: 'DocumentType',
            entityId: id,
            actorId,
            before: { isActive: type.isActive },
            after: { isActive: updated.isActive },
        });

        return updated;
    }

    async remove(id: string, actorId: string | undefined) {
        const type = await this.prisma.documentType.findUnique({
            where: { id },
            include: { _count: { select: { documents: true } } },
        });
        if (!type) throw new NotFoundException('Document type not found');
        if (type.isSystem) {
            throw new BadRequestException(`"${type.name}" is a built-in document type and cannot be deleted`);
        }
        if (type._count.documents > 0) {
            throw new BadRequestException(
                `Cannot delete "${type.name}" -- ${type._count.documents} document version(s) already exist under it. Deactivate it instead.`,
            );
        }

        await this.prisma.documentType.delete({ where: { id } });

        await this.systemAuditService.log({
            action: 'DOCUMENT_TYPE_DELETED',
            entityType: 'DocumentType',
            entityId: id,
            actorId,
            before: { name: type.name },
        });
    }
}