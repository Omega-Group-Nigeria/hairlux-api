import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { S3Service } from '../storage/s3.service';
import { CompanyDocumentService } from './company-document.service';
import { CreateCompanyDocumentDto } from './dto/create-company-document.dto';

const MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024; // 15MB -- handbooks can run longer than a CV

@ApiTags('Admin - Company Documents')
@ApiBearerAuth('JWT-auth')
@Controller('admin/company-documents')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminCompanyDocumentController {
  constructor(
    private readonly documentService: CompanyDocumentService,
    private readonly s3Service: S3Service,
  ) { }

  @Post('upload')
  @ApiOperation({
    summary: 'Upload a company document file (PDF) and get back its storage key',
    description:
      'Upload the actual file here first, then pass the returned contentUrl ' +
      '(actually a storage key, see field description) to POST ' +
      '/admin/company-documents to record the document version. The file ' +
      'lives in a private bucket -- a fresh presigned view URL is generated ' +
      'on demand whenever documents are listed, never stored as a permanent link.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Missing file, wrong file type, or file too large' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing staff:manage_documents permission' })
  @Permission(PERMISSIONS.STAFF_MANAGE_DOCUMENTS)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
    }),
  )
  async uploadDocumentFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach a PDF under the "file" field.');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted for company documents.');
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException('File must be 15MB or smaller.');
    }

    const contentUrl = await this.s3Service.uploadObject(
      file.buffer,
      'company-documents',
      file.originalname,
      file.mimetype,
    );

    return {
      success: true,
      message: 'File uploaded successfully',
      data: { contentUrl },
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new version of a company document',
    description:
      'Creates a new version and deactivates whatever was previously active ' +
      'for that document type. Prior versions are kept (not deleted) so a ' +
      "staff member's historical acknowledgment stays a true record of what " +
      'they actually agreed to, even after the handbook is later updated. ' +
      'Upload the actual file via the existing S3 upload flow first, then ' +
      'pass its URL here.',
  })
  @ApiResponse({ status: 201, description: 'Document version created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing staff:manage_documents permission' })
  @Permission(PERMISSIONS.STAFF_MANAGE_DOCUMENTS)
  async create(@Body() dto: CreateCompanyDocumentDto) {
    const data = await this.documentService.createDocument(dto);
    return { success: true, message: 'Document version created successfully', data };
  }

  @Get()
  @ApiOperation({ summary: 'List the currently active version of every document type' })
  @ApiResponse({ status: 200, description: 'Active documents retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing staff:read permission' })
  @Permission(PERMISSIONS.STAFF_READ)
  async listActive() {
    const data = await this.documentService.listActiveDocuments();
    return { success: true, message: 'Active documents retrieved successfully', data };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a company document -- Dev Feedback Round 6, item #20',
    description: "Only succeeds if nobody has acknowledged this specific version yet, since deleting an acknowledged document would destroy the historical record of what that staff member agreed to. Upload a new version instead of trying to delete an in-use one.",
  })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  @ApiResponse({ status: 409, description: 'One or more staff have already acknowledged this document' })
  @Permission(PERMISSIONS.STAFF_MANAGE_DOCUMENTS)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.documentService.remove(id);
    return { success: true, message: 'Document deleted successfully', data };
  }
}