import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Product, ProductStatus } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminQueryProductsDto } from '../dto/admin-query-products.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { QueryProductsDto } from '../dto/query-products.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductCategoryService } from './product-category.service';

const categorySelect = {
  id: true,
  name: true,
  description: true,
} as const;

type ProductWithCategory = Product & {
  category: {
    id: string;
    name: string;
    description: string | null;
  };
};

@Injectable()
export class ProductCatalogService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private productCategoryService: ProductCategoryService,
  ) {}

  private toCategorySummary(category: ProductWithCategory['category']) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
    };
  }

  toProductResponse(product: ProductWithCategory) {
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
      imageUrl: product.imageUrl,
    };
  }

  toAdminProductResponse(product: ProductWithCategory) {
    return {
      ...this.toProductResponse(product),
      imagePublicId: product.imagePublicId,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private async assertCategoryExists(categoryId: string) {
    await this.productCategoryService.findById(categoryId);
  }

  async findActiveProducts(queryDto: QueryProductsDto) {
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
        include: { category: { select: categorySelect } },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products.map((product) => this.toProductResponse(product)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
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
        include: { category: { select: categorySelect } },
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
    const product = await this.prisma.product.findFirst({
      where: { id, status: ProductStatus.ACTIVE },
      include: { category: { select: categorySelect } },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toProductResponse(product);
  }

  async findAdminProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: { select: categorySelect } },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toAdminProductResponse(product);
  }

  async create(createProductDto: CreateProductDto, imageFile: Express.Multer.File) {
    if (!imageFile) {
      throw new BadRequestException('A product image is required.');
    }

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

    const { secureUrl, publicId } = await this.cloudinary.uploadImage(
      imageFile.buffer,
      'hairlux/shop',
    );

    const product = await this.prisma.product.create({
      data: {
        categoryId: createProductDto.categoryId,
        name: createProductDto.name,
        description: createProductDto.description,
        price: createProductDto.price,
        stock: createProductDto.stock ?? 0,
        imageUrl: secureUrl,
        imagePublicId: publicId,
        status: ProductStatus.ACTIVE,
      },
      include: { category: { select: categorySelect } },
    });

    return this.toAdminProductResponse(product);
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    imageFile?: Express.Multer.File,
  ) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
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

    let imageUrl: string | undefined;
    let imagePublicId: string | undefined;
    if (imageFile) {
      const uploaded = await this.cloudinary.uploadImage(
        imageFile.buffer,
        'hairlux/shop',
      );
      imageUrl = uploaded.secureUrl;
      imagePublicId = uploaded.publicId;

      if (existing.imagePublicId) {
        await this.cloudinary.deleteImage(existing.imagePublicId);
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...updateProductDto,
        ...(imageUrl && { imageUrl, imagePublicId }),
      },
      include: { category: { select: categorySelect } },
    });

    return this.toAdminProductResponse(product);
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

    return {
      id: product.id,
      status: product.status,
    };
  }

  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (existing.imagePublicId) {
      await this.cloudinary.deleteImage(existing.imagePublicId);
    }

    await this.prisma.product.delete({ where: { id } });
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