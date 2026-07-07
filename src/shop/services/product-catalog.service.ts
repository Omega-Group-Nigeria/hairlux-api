import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Product, ProductImage, ProductStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AdminQueryProductsDto } from '../dto/admin-query-products.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { QueryProductsDto } from '../dto/query-products.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import {
  assertTotalProductImageCount,
  getPrimaryImageUrl,
  toAdminProductImageResponses,
  toProductImageResponses,
  uploadProductImages,
  validateProductImageFiles,
} from '../utils/product-image.utils';
import {
  invalidateShopCatalogCache,
  SHOP_CATALOG_CACHE_TTL_SECONDS,
  shopProductOneCacheKey,
  shopProductsListCacheKey,
} from '../utils/shop-cache.utils';
import { ProductCategoryService } from './product-category.service';

const categorySelect = {
  id: true,
  name: true,
  description: true,
} as const;

const imagesInclude = {
  orderBy: { sortOrder: 'asc' as const },
};

type ProductWithRelations = Product & {
  category: {
    id: string;
    name: string;
    description: string | null;
  };
  images: ProductImage[];
};

@Injectable()
export class ProductCatalogService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private redis: RedisService,
    private productCategoryService: ProductCategoryService,
  ) {}

  private toCategorySummary(category: ProductWithRelations['category']) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
    };
  }

  toProductResponse(product: ProductWithRelations) {
    const images = toProductImageResponses(product.images);

    return {
      id: product.id,
      categoryId: product.categoryId,
      category: this.toCategorySummary(product.category),
      name: product.name,
      description: product.description,
      price: Number(product.price),
      stock: product.stock,
      inStock: product.stock > 0,
      status: product.status,
      images,
      imageUrl: getPrimaryImageUrl(product.images),
    };
  }

  toAdminProductResponse(product: ProductWithRelations) {
    return {
      ...this.toProductResponse(product),
      images: toAdminProductImageResponses(product.images),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private async assertCategoryExists(categoryId: string) {
    await this.productCategoryService.findById(categoryId);
  }

  async findActiveProducts(queryDto: QueryProductsDto) {
    const cacheKey = shopProductsListCacheKey(queryDto);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { search, categoryId, page = 1, limit = 20 } = queryDto;
    const skip = (page - 1) * limit;

    const where = {
      status: ProductStatus.ACTIVE,
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          category: { select: categorySelect },
          images: imagesInclude,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const result = {
      data: products.map((product) => this.toProductResponse(product)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.redis.set(cacheKey, result, SHOP_CATALOG_CACHE_TTL_SECONDS);
    return result;
  }

  async findAdminProducts(queryDto: AdminQueryProductsDto) {
    const { status, search, categoryId, page = 1, limit = 20 } = queryDto;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: categorySelect },
          images: imagesInclude,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products.map((product) => this.toAdminProductResponse(product)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findActiveProductById(id: string) {
    const cacheKey = shopProductOneCacheKey(id);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.prisma.product.findFirst({
      where: { id, status: ProductStatus.ACTIVE },
      include: {
        category: { select: categorySelect },
        images: imagesInclude,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const result = this.toProductResponse(product);
    await this.redis.set(cacheKey, result, SHOP_CATALOG_CACHE_TTL_SECONDS);
    return result;
  }

  async findAdminProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: categorySelect },
        images: imagesInclude,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toAdminProductResponse(product);
  }

  async create(
    createProductDto: CreateProductDto,
    imageFiles: Express.Multer.File[],
  ) {
    const images = validateProductImageFiles(imageFiles, { required: true });

    await this.assertCategoryExists(createProductDto.categoryId);

    const existing = await this.prisma.product.findFirst({
      where: {
        categoryId: createProductDto.categoryId,
        name: { equals: createProductDto.name, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw new ConflictException(
        'A product with this name already exists in this category',
      );
    }

    const productId = randomUUID();
    const uploadedImages = await uploadProductImages(
      this.cloudinary,
      productId,
      images,
    );

    const product = await this.prisma.product.create({
      data: {
        id: productId,
        categoryId: createProductDto.categoryId,
        name: createProductDto.name,
        description: createProductDto.description,
        price: createProductDto.price,
        stock: createProductDto.stock ?? 0,
        status: ProductStatus.ACTIVE,
        images: {
          create: uploadedImages.map((image) => ({
            url: image.url,
            publicId: image.publicId,
            sortOrder: image.sortOrder,
          })),
        },
      },
      include: {
        category: { select: categorySelect },
        images: imagesInclude,
      },
    });

    const response = this.toAdminProductResponse(product);
    void invalidateShopCatalogCache(this.redis, { productId });
    return response;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    imageFiles?: Express.Multer.File[],
  ) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { images: imagesInclude },
    });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (updateProductDto.categoryId) {
      await this.assertCategoryExists(updateProductDto.categoryId);
    }

    if (updateProductDto.name) {
      const duplicate = await this.prisma.product.findFirst({
        where: {
          id: { not: id },
          categoryId: updateProductDto.categoryId ?? existing.categoryId,
          name: { equals: updateProductDto.name, mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          'A product with this name already exists in this category',
        );
      }
    }

    const newImages = validateProductImageFiles(imageFiles);
    const removeImageIds = updateProductDto.removeImageIds ?? [];
    const imagesToRemove = existing.images.filter((image) =>
      removeImageIds.includes(image.id),
    );

    if (removeImageIds.length > 0 && imagesToRemove.length !== removeImageIds.length) {
      throw new BadRequestException(
        'One or more image IDs to remove were not found on this product.',
      );
    }

    const remainingCount =
      existing.images.length - imagesToRemove.length + newImages.length;
    assertTotalProductImageCount(remainingCount);

    if (imagesToRemove.length > 0) {
      await this.cloudinary.deleteImages(
        imagesToRemove.map((image) => image.publicId),
      );
      await this.prisma.productImage.deleteMany({
        where: {
          id: { in: imagesToRemove.map((image) => image.id) },
          productId: id,
        },
      });
    }

    if (newImages.length > 0) {
      const remainingImages = existing.images.filter(
        (image) => !removeImageIds.includes(image.id),
      );
      const nextSortOrder =
        remainingImages.length > 0
          ? Math.max(...remainingImages.map((image) => image.sortOrder)) + 1
          : 0;
      const uploadedImages = await uploadProductImages(
        this.cloudinary,
        id,
        newImages,
        nextSortOrder,
      );

      await this.prisma.productImage.createMany({
        data: uploadedImages.map((image) => ({
          productId: id,
          url: image.url,
          publicId: image.publicId,
          sortOrder: image.sortOrder,
        })),
      });
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(updateProductDto.categoryId !== undefined && {
          categoryId: updateProductDto.categoryId,
        }),
        ...(updateProductDto.name !== undefined && {
          name: updateProductDto.name,
        }),
        ...(updateProductDto.description !== undefined && {
          description: updateProductDto.description,
        }),
        ...(updateProductDto.price !== undefined && {
          price: updateProductDto.price,
        }),
        ...(updateProductDto.stock !== undefined && {
          stock: updateProductDto.stock,
        }),
      },
      include: {
        category: { select: categorySelect },
        images: imagesInclude,
      },
    });

    const response = this.toAdminProductResponse(product);
    void invalidateShopCatalogCache(this.redis, { productId: id });
    return response;
  }

  async updateStatus(id: string, status: ProductStatus) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { status },
    });

    const response = {
      id: product.id,
      status: product.status,
    };
    void invalidateShopCatalogCache(this.redis, { productId: id });
    return response;
  }

  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (existing.images.length > 0) {
      await this.cloudinary.deleteImages(
        existing.images.map((image) => image.publicId),
      );
    }

    await this.prisma.product.delete({ where: { id } });
    void invalidateShopCatalogCache(this.redis, { productId: id });
  }

  async loadActiveProductsForCheckout(productIds: string[]) {
    const uniqueIds = [...new Set(productIds)];
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: uniqueIds },
        status: ProductStatus.ACTIVE,
      },
    });

    if (products.length !== uniqueIds.length) {
      const found = new Set(products.map((product) => product.id));
      const missing = uniqueIds.find((id) => !found.has(id));
      throw new NotFoundException(`Product ${missing} not found`);
    }

    return products;
  }
}