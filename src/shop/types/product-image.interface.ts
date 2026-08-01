export interface ProductImageResponse {
  id: string;
  url: string;
  sortOrder: number;
}

export interface AdminProductImageResponse extends ProductImageResponse {
  publicId: string;
}