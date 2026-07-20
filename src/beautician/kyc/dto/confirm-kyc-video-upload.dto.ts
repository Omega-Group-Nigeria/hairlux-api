import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  KYC_VIDEO_ALLOWED_CONTENT_TYPES,
  KYC_VIDEO_MAX_SIZE_BYTES,
} from '../../../storage/r2.constants';

export class ConfirmKycVideoUploadDto {
  @ApiProperty({
    description: 'R2 object key returned from request-upload',
    example: 'kyc-videos/user-uuid/video-uuid.mp4',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  fileKey!: string;

  @ApiProperty({
    description: 'MIME type of the uploaded video',
    enum: KYC_VIDEO_ALLOWED_CONTENT_TYPES,
    example: 'video/mp4',
  })
  @IsIn([...KYC_VIDEO_ALLOWED_CONTENT_TYPES])
  contentType!: (typeof KYC_VIDEO_ALLOWED_CONTENT_TYPES)[number];

  @ApiProperty({
    description: 'Actual uploaded file size in bytes',
    example: 7_500_000,
    required: false,
    maximum: KYC_VIDEO_MAX_SIZE_BYTES,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(KYC_VIDEO_MAX_SIZE_BYTES)
  fileSizeBytes?: number;
}
