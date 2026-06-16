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

@Injectable()
export class ProductCatalogService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  toProductResponse(product: Product) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: Number(product.price),
      stock: product.stock,
      inStock: product.stock > 0,
      status: product.status,
      imageUrl: product.imageUrl,
    };
  }

  toAdminProductResponse(product: Product) {
    return {
      ...this.toProductResponse(product),
      imagePublicId: product.imagePublicId,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  async findActiveProducts(queryDto: QueryProductsDto) {
    const { search, page = 1, limit = 20 } = queryDto;
    const skip = (page - 1) * limit;

    const where = {
      status: ProductStatus.ACTIVE,
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
    const { status, search, page = 1, limit = 20 } = queryDto;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
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
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toProductResponse(product);
  }

  async findAdminProductById(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toAdminProductResponse(product);
  }

  async create(createProductDto: CreateProductDto, imageFile: Express.Multer.File) {
    if (!imageFile) {
      throw new BadRequestException('A product image is required.');
    }

    const existing = await this.prisma.product.findFirst({
      where: { name: { equals: createProductDto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('A product with this name already exists');
    }

    const { secureUrl, publicId } = await this.cloudinary.uploadImage(
      imageFile.buffer,
      'hairlux/shop',
    );

    const product = await this.prisma.product.create({
      data: {
        name: createProductDto.name,
        description: createProductDto.description,
        price: createProductDto.price,
        stock: createProductDto.stock ?? 0,
        imageUrl: secureUrl,
        imagePublicId: publicId,
        status: ProductStatus.ACTIVE,
      },
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

    if (updateProductDto.name) {
      const duplicate = await this.prisma.product.findFirst({
        where: {
          id: { not: id },
          name: { equals: updateProductDto.name, mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw new ConflictException('A product with this name already exists');
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