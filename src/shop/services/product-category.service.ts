import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateProductCategoryDto } from '../dto/create-product-category.dto';
import { UpdateProductCategoryDto } from '../dto/update-product-category.dto';
import {
  invalidateShopCatalogCache,
  SHOP_CATALOG_CACHE_TTL_SECONDS,
  SHOP_CATEGORIES_PUBLIC_CACHE_KEY,
} from '../utils/shop-cache.utils';

@Injectable()
export class ProductCategoryService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private toCategoryResponse(category: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { products: number };
  }) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      ...(category._count !== undefined
        ? { productCount: category._count.products }
        : {}),
    };
  }

  async findAllPublic() {
    const cached = await this.redis.get(SHOP_CATEGORIES_PUBLIC_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const categories = await this.prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: {
              where: { status: ProductStatus.ACTIVE },
            },
          },
        },
      },
    });

    const result = categories.map((category) => this.toCategoryResponse(category));
    await this.redis.set(
      SHOP_CATEGORIES_PUBLIC_CACHE_KEY,
      result,
      SHOP_CATALOG_CACHE_TTL_SECONDS,
    );
    return result;
  }

  async findAllAdmin() {
    const categories = await this.prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { products: true },
        },
      },
    });

    return categories.map((category) => this.toCategoryResponse(category));
  }

  async findById(id: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Product category not found');
    }

    return category;
  }

  async create(dto: CreateProductCategoryDto) {
    const existing = await this.prisma.productCategory.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }

    const category = await this.prisma.productCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
    });

    const response = this.toCategoryResponse(category);
    void invalidateShopCatalogCache(this.redis);
    return response;
  }

  async update(id: string, dto: UpdateProductCategoryDto) {
    const existing = await this.prisma.productCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Product category not found');
    }

    if (dto.name) {
      const duplicate = await this.prisma.productCategory.findFirst({
        where: {
          id: { not: id },
          name: { equals: dto.name, mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw new ConflictException('A category with this name already exists');
      }
    }

    const category = await this.prisma.productCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });

    const response = this.toCategoryResponse(category);
    void invalidateShopCatalogCache(this.redis);
    return response;
  }

  async remove(id: string) {
    const existing = await this.prisma.productCategory.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Product category not found');
    }

    if (existing._count.products > 0) {
      throw new ConflictException(
        `Cannot delete category with ${existing._count.products} product(s) attached. Reassign or delete them first.`,
      );
    }

    await this.prisma.productCategory.delete({ where: { id } });
    void invalidateShopCatalogCache(this.redis);
  }
}