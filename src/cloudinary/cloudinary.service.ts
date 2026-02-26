import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import sharp from 'sharp';
import { Readable } from 'stream';

export interface CloudinaryUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.getOrThrow<string>(
        'CLOUDINARY_CLOUD_NAME',
      ),
      api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_SECRET',
      ),
    });
  }

  /**
   * Converts a buffer to WebP via sharp, then uploads to Cloudinary.
   * @param buffer  Raw file buffer from multer
   * @param folder  Cloudinary folder (e.g. 'services')
   * @param publicId Optional – reuse / overwrite an existing asset
   */
  async uploadImage(
    buffer: Buffer,
    folder: string,
    publicId?: string,
  ): Promise<CloudinaryUploadResult> {
    // 1. Convert to WebP (max 1200px wide, quality 85 – good balance of size vs quality)
    let webpBuffer: Buffer;
    try {
      webpBuffer = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch (err) {
      this.logger.error('Sharp conversion failed', err);
      throw new InternalServerErrorException(
        'Image processing failed. Ensure the file is a valid image.',
      );
    }

    // 2. Upload to Cloudinary via upload_stream
    return new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const uploadOptions: Record<string, unknown> = {
        folder,
        format: 'webp',
        resource_type: 'image',
        overwrite: true,
      };
      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload failed', error);
            return reject(
              new InternalServerErrorException(
                'Failed to upload image to Cloudinary. Please try again.',
              ),
            );
          }
          resolve({
            url: result.url,
            secureUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      // Pipe the WebP buffer into the upload stream
      const readable = new Readable();
      readable.push(webpBuffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  /**
   * Deletes an image from Cloudinary by its public_id.
   * Swallows errors so a missing asset never blocks the main flow.
   */
  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Deleted Cloudinary asset: ${publicId}`);
    } catch (err) {
      // Non-fatal – log but do not throw
      this.logger.warn(`Could not delete Cloudinary asset ${publicId}: ${err}`);
    }
  }
}
