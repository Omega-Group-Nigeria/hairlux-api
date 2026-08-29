import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { StaffService } from './staff.service';
import { DocumentTypeService } from './document-type.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { SetDocumentTypeActiveDto } from './dto/set-document-type-active.dto';

@ApiTags('Admin - Document Types')
@ApiBearerAuth('JWT-auth')
@Controller('admin/document-types')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminDocumentTypeController {
    constructor(
        private readonly documentTypeService: DocumentTypeService,
        private readonly staffService: StaffService,
    ) { }

    @Get()
    @Permission(PERMISSIONS.STAFF_MANAGE_DOCUMENTS)
    @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
    async findAll(@Query('activeOnly') activeOnly?: string) {
        const data = await this.documentTypeService.findAll(activeOnly === 'true');
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Post()
    @Permission(PERMISSIONS.STAFF_MANAGE_DOCUMENTS)
    @ApiOperation({ summary: 'Create a custom document type -- the 6 built-in types already cover the standard set' })
    async create(@Req() req: any, @Body() dto: CreateDocumentTypeDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.documentTypeService.create(dto.name, actor?.id);
        return { success: true, message: 'Document type created successfully', data };
    }

    @Patch(':id/active')
    @Permission(PERMISSIONS.STAFF_MANAGE_DOCUMENTS)
    @ApiParam({ name: 'id' })
    async setActive(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetDocumentTypeActiveDto) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        const data = await this.documentTypeService.setActive(id, dto.isActive, actor?.id);
        return { success: true, message: 'Document type updated successfully', data };
    }

    @Delete(':id')
    @Permission(PERMISSIONS.STAFF_MANAGE_DOCUMENTS)
    @ApiOperation({ summary: 'Delete a custom document type -- built-in types cannot be deleted, and a type with existing document versions must be deactivated instead' })
    @ApiParam({ name: 'id' })
    async remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        const actor = await this.staffService.findByUserIdOrNull(req.user.id);
        await this.documentTypeService.remove(id, actor?.id);
        return { success: true, message: 'Document type deleted successfully' };
    }
}