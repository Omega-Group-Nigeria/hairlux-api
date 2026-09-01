import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCompanyDocumentDto {
  @ApiProperty({ description: 'The DocumentType this version belongs to -- create it first via POST /admin/document-types if it does not already exist.' })
  @IsUUID()
  documentTypeId: string;

  @ApiProperty({ example: 'Hairlux Confidentiality Agreement (NDA)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @ApiProperty({
    example: 'company-documents/9f1c2e-nda-v3.pdf',
    description:
      'S3 object KEY (not a URL) -- upload via POST /admin/company-documents/upload ' +
      'first, which returns this key. The file lives in a private bucket; a ' +
      'fresh presigned view URL is generated on demand every time this ' +
      'document is listed, never stored, since presigned URLs expire.',
  })
  @IsString()
  @IsNotEmpty()
  contentUrl: string;
}