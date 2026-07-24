import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export enum CompanyDocumentTypeDto {
  EMPLOYMENT_CONTRACT = 'EMPLOYMENT_CONTRACT',
  NDA = 'NDA',
  IT_ACCEPTABLE_USE_POLICY = 'IT_ACCEPTABLE_USE_POLICY',
  STAFF_HANDBOOK = 'STAFF_HANDBOOK',
  CODE_OF_CONDUCT = 'CODE_OF_CONDUCT',
  DATA_PROTECTION_POLICY = 'DATA_PROTECTION_POLICY',
}

export class CreateCompanyDocumentDto {
  @ApiProperty({ enum: CompanyDocumentTypeDto, example: CompanyDocumentTypeDto.NDA })
  @IsEnum(CompanyDocumentTypeDto)
  type: CompanyDocumentTypeDto;

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