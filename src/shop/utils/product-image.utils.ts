import { BadRequestException } from '@nestjs/common';
import { ProductImage } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import {
  getProductImageFolder,
  MAX_PRODUCT_IMAGES,
} from '../constants/product-images.constants';
import {
  AdminProductImageResponse,
  ProductImageResponse,
} from '../types/product-image.interface';

export function validateProductImageFiles(
  files: Express.Multer.File[] | undefined,
  options: { required?: boolean; label?: string } = {},
): Express.Multer.File[] {
  const { required = false, label = 'images' } = options;
  const normalized = (files ?? []).filter((file) => file?.buffer?.length);

  if (required && normalized.length === 0) {
    throw new BadRequestException(
      `At least one product image is required in the "${label}" field.`,
    );
  }

  if (normalized.length > MAX_PRODUCT_IMAGES) {
    throw new BadRequestException(
      `A product can have at most ${MAX_PRODUCT_IMAGES} images.`,
    );
  }

  for (const file of normalized) {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed.');
    }
  }

  return normalized;
}

export function assertTotalProductImageCount(count: number): void {
  if (count < 1) {
    throw new BadRequestException('A product must have at least one image.');
  }

  if (count > MAX_PRODUCT_IMAGES) {
    throw new BadRequestException(
      `A product can have at most ${MAX_PRODUCT_IMAGES} images.`,
    );
  }
}

export function toProductImageResponses(
  images: ProductImage[],
): ProductImageResponse[] {
  return images
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image) => ({
      id: image.id,
      url: image.url,
      sortOrder: image.sortOrder,
    }));
}

export function toAdminProductImageResponses(
  images: ProductImage[],
): AdminProductImageResponse[] {
  return images
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image) => ({
      id: image.id,
      url: image.url,
      publicId: image.publicId,
      sortOrder: image.sortOrder,
    }));
}

export function getPrimaryImageUrl(
  images: ProductImage[],
): string | null {
  const sorted = images
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted[0]?.url ?? null;
}

export async function uploadProductImages(
  cloudinary: CloudinaryService,
  productId: string,
  files: Express.Multer.File[],
  startSortOrder = 0,
): Promise<Array<{ url: string; publicId: string; sortOrder: number }>> {
  const folder = getProductImageFolder(productId);

  const uploads = await Promise.all(
    files.map(async (file, index) => {
      const sortOrder = startSortOrder + index;
      const uploaded = await cloudinary.uploadImage(
        file.buffer,
        folder,
        `img_${sortOrder + 1}`,
      );

      return {
        url: uploaded.secureUrl,
        publicId: uploaded.publicId,
        sortOrder,
      };
    }),
  );

  return uploads;
}