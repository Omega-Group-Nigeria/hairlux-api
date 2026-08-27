import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RefreshKycVideoUploadDto {
  @ApiProperty({ description: 'Multipart uploadId from request-upload', example: 'upload-uuid' })
  @IsString()
  @IsNotEmpty()
  uploadId!: string;
}
