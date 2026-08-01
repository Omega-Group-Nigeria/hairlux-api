export const MAX_PRODUCT_IMAGES = 5;

export const PRODUCT_IMAGE_CLOUDINARY_ROOT = 'hairlux/shop/products';

export function getProductImageFolder(productId: string): string {
  return `${PRODUCT_IMAGE_CLOUDINARY_ROOT}/${productId}`;
}