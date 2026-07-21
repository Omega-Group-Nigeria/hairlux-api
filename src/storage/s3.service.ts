import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

/**
 * Wraps an S3-compatible object storage bucket (any provider — AWS S3,
 * Storj, R2, etc. — anything that speaks the S3 API). Used for applicant
 * documents (currently just CVs).
 *
 * Files are uploaded WITHOUT any public-read ACL. This bucket holds
 * applicant PII (CVs), so "view" access is granted per-request via a
 * short-lived presigned URL (see getPresignedUrl), not a permanently
 * public link. Never make this bucket/object public.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET') || '';

    this.client = new S3Client({
      region: this.configService.get<string>('S3_REGION') || 'auto',
      endpoint: this.configService.get<string>('S3_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY_ID') || '',
        secretAccessKey:
          this.configService.get<string>('S3_SECRET_ACCESS_KEY') || '',
      },
      // Required for most non-AWS S3-compatible providers — without this,
      // the SDK builds virtual-hosted-style URLs (bucket.endpoint.com)
      // which many S3-compatible providers don't support.
      forcePathStyle: true,
    });
  }

  /**
   * Uploads a buffer under a generated key within `folder/`.
   * Returns the object key — NOT a URL. Store the key; generate a
   * presigned URL on demand via getPresignedUrl() when actually needed.
   */
  async uploadObject(
    buffer: Buffer,
    folder: string,
    originalFilename: string,
    contentType: string,
  ): Promise<string> {
    const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${randomUUID()}-${safeName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return key;
  }

  /**
   * Generates a time-limited signed URL for viewing/downloading a private
   * object. Default 1 hour — deliberately longer than the 5-minute
   * Redis cache TTL used elsewhere in this app, so a cached response never
   * serves an already-expired link.
   */
  async getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    } catch (err) {
      this.logger.error(
        `Failed to generate presigned URL for key "${key}": ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}