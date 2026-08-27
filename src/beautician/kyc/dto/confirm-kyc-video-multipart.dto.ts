import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  KYC_VIDEO_ALLOWED_CONTENT_TYPES,
  KYC_VIDEO_MAX_SIZE_BYTES,
} from '../../../storage/r2.constants';

export class MultipartPartDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  partNumber!: number;

  @ApiProperty({ example: '"abc123etag"' })
  @IsString()
  @IsNotEmpty()
  etag!: string;
}

export class ConfirmKycVideoMultipartDto {
  @ApiProperty({ example: 'kyc-videos/user-uuid/video-uuid.mp4' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  fileKey!: string;

  @ApiProperty({ example: 'upload-uuid-from-request' })
  @IsString()
  @IsNotEmpty()
  uploadId!: string;

  @ApiProperty({ enum: KYC_VIDEO_ALLOWED_CONTENT_TYPES, example: 'video/mp4' })
  @IsIn([...KYC_VIDEO_ALLOWED_CONTENT_TYPES])
  contentType!: (typeof KYC_VIDEO_ALLOWED_CONTENT_TYPES)[number];

  @ApiProperty({ type: [MultipartPartDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MultipartPartDto)
  parts!: MultipartPartDto[];

  @ApiPropertyOptional({ example: 7500000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(KYC_VIDEO_MAX_SIZE_BYTES)
  fileSizeBytes?: number;
}
