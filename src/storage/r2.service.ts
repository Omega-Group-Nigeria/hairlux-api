import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  NotFound,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import {
  KYC_VIDEO_DOWNLOAD_URL_TTL_SECONDS,
  KYC_VIDEO_KEY_PREFIX,
  KYC_VIDEO_UPLOAD_URL_TTL_SECONDS,
  type KycVideoContentType,
} from './r2.constants';

export type PresignedUploadResult = {
  uploadUrl: string;
  fileKey: string;
  expiresIn: number;
  expiresAt: string;
  maxSizeBytes: number;
  contentType: string;
};

export type PresignedDownloadResult = {
  downloadUrl: string;
  fileKey: string;
  expiresIn: number;
  expiresAt: string;
};

@Injectable()
export class R2Service implements OnModuleInit {
  private readonly logger = new Logger(R2Service.name);
  private client: S3Client | null = null;
  private bucketName: string | null = null;
  private publicBaseUrl: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    const endpoint = this.configService.get<string>('R2_ENDPOINT');
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME');
    const publicBase = this.configService.get<string>('R2_PUBLIC_BASE_URL');

    if (publicBase?.trim()) {
      this.publicBaseUrl = publicBase.replace(/\/+$/, '');
    } else {
      this.logger.warn(
        'R2_PUBLIC_BASE_URL not set — admin KYC video public URLs will be unavailable',
      );
    }

    if (!accessKeyId || !secretAccessKey || !endpoint || !bucketName) {
      this.logger.warn(
        'R2 credentials incomplete — KYC video upload endpoints will fail until configured',
      );
      return;
    }

    this.bucketName = bucketName;
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  /**
   * Public object URL for a stored key (bucket public access via r2.dev or custom domain).
   * fileKey already includes prefix e.g. `kyc-videos/{userId}/{uuid}.mp4`.
   */
  getPublicUrl(fileKey: string): string | null {
    if (!this.publicBaseUrl || !fileKey?.trim()) {
      return null;
    }
    const key = fileKey.replace(/^\/+/, '');
    return `${this.publicBaseUrl}/${key}`;
  }

  buildKycVideoKey(userId: string, contentType: KycVideoContentType): string {
    const ext =
      contentType === 'video/quicktime'
        ? 'mov'
        : contentType === 'video/webm'
          ? 'webm'
          : 'mp4';
    return `${KYC_VIDEO_KEY_PREFIX}/${userId}/${randomUUID()}.${ext}`;
  }

  isOwnedKycVideoKey(userId: string, fileKey: string): boolean {
    const prefix = `${KYC_VIDEO_KEY_PREFIX}/${userId}/`;
    return (
      fileKey.startsWith(prefix) &&
      !fileKey.includes('..') &&
      fileKey.length <= 512
    );
  }

  async createPresignedUploadUrl(
    fileKey: string,
    contentType: KycVideoContentType,
    maxSizeBytes: number,
  ): Promise<PresignedUploadResult> {
    const { client, bucket } = this.requireClient();

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        ContentType: contentType,
        // Enforce size via Content-Length on the client; R2 will reject if headers mismatch
      });

      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: KYC_VIDEO_UPLOAD_URL_TTL_SECONDS,
      });

      const expiresAt = new Date(
        Date.now() + KYC_VIDEO_UPLOAD_URL_TTL_SECONDS * 1000,
      ).toISOString();

      return {
        uploadUrl,
        fileKey,
        expiresIn: KYC_VIDEO_UPLOAD_URL_TTL_SECONDS,
        expiresAt,
        maxSizeBytes,
        contentType,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create R2 presigned upload URL: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Unable to create video upload URL',
      );
    }
  }

  async createPresignedDownloadUrl(
    fileKey: string,
    expiresInSeconds: number = KYC_VIDEO_DOWNLOAD_URL_TTL_SECONDS,
  ): Promise<PresignedDownloadResult> {
    const { client, bucket } = this.requireClient();

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: fileKey,
      });

      const downloadUrl = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
      });

      return {
        downloadUrl,
        fileKey,
        expiresIn: expiresInSeconds,
        expiresAt: new Date(
          Date.now() + expiresInSeconds * 1000,
        ).toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to create R2 presigned download URL: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Unable to create video download URL',
      );
    }
  }

  /**
   * Deletes a KYC video object. Best-effort (never throws):
   * missing keys / unconfigured storage are logged and ignored so admin reject still succeeds.
   */
  async deleteObject(fileKey: string): Promise<void> {
    if (!fileKey?.trim()) {
      return;
    }

    if (!this.client || !this.bucketName) {
      this.logger.warn(
        `Skip R2 delete — storage not configured (key=${fileKey})`,
      );
      return;
    }

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `R2 DeleteObject failed for key ${fileKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Confirms the object exists in R2 and returns size/content-type metadata.
   */
  async headObject(fileKey: string): Promise<{
    contentLength: number;
    contentType: string | undefined;
  }> {
    const { client, bucket } = this.requireClient();

    try {
      const result = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        }),
      );

      return {
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType,
      };
    } catch (error) {
      const name =
        error && typeof error === 'object' && 'name' in error
          ? String((error as { name: string }).name)
          : '';
      const httpStatus =
        error && typeof error === 'object' && '$metadata' in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode
          : undefined;

      if (
        name === 'NotFound' ||
        name === 'NoSuchKey' ||
        name === 'NotFoundException' ||
        error instanceof NotFound ||
        httpStatus === 404
      ) {
        throw new BadRequestException(
          'Uploaded video not found in storage. Please re-upload.',
        );
      }

      this.logger.warn(
        `R2 HeadObject failed for key ${fileKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Unable to verify uploaded video in storage',
      );
    }
  }

  private requireClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucketName) {
      throw new InternalServerErrorException(
        'Video storage is not configured. Contact support.',
      );
    }
    return { client: this.client, bucket: this.bucketName };
  }
}
