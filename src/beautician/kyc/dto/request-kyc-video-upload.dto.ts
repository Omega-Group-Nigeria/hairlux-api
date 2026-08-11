import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  KYC_VIDEO_ALLOWED_CONTENT_TYPES,
  KYC_VIDEO_MAX_SIZE_BYTES,
} from '../../../storage/r2.constants';

export class RequestKycVideoUploadDto {
  @ApiProperty({
    description: 'MIME type of the compressed video file',
    enum: KYC_VIDEO_ALLOWED_CONTENT_TYPES,
    example: 'video/mp4',
  })
  @IsIn([...KYC_VIDEO_ALLOWED_CONTENT_TYPES])
  contentType!: (typeof KYC_VIDEO_ALLOWED_CONTENT_TYPES)[number];

  @ApiProperty({
    description:
      'Expected file size in bytes after compression (max 100 MB). Optional; used for client guidance.',
    required: false,
    example: 8_000_000,
    maximum: KYC_VIDEO_MAX_SIZE_BYTES,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(KYC_VIDEO_MAX_SIZE_BYTES)
  fileSizeBytes?: number;
}
