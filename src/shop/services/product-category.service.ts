import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductCategoryDto } from '../dto/create-product-category.dto';
import { UpdateProductCategoryDto } from '../dto/update-product-category.dto';

@Injectable()
export class ProductCategoryService {
  constructor(private prisma: PrismaService) {}

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

    return categories.map((category) => this.toCategoryResponse(category));
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

    return this.toCategoryResponse(category);
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

    return this.toCategoryResponse(category);
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
  }
}