import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryServicesDto } from './dto/query-services.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ServiceStatus } from '@prisma/client';
import { RedisService } from '../redis/redis.service';

const TTL = 300; // 5 minutes

@Injectable()
export class ServiceCatalogService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private redis: RedisService,
  ) {}

  async findAll(queryDto: QueryServicesDto) {
    const cacheKey = `services:list:${JSON.stringify(queryDto)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const { categoryId, search, status } = queryDto;

    // Build where clause
    const where: {
      status?: ServiceStatus;
      categoryId?: string;
      OR?: Array<{ name: { contains: string; mode: 'insensitive' } }>;
    } = {};

    // Default to ACTIVE services only for public endpoint
    where.status = status ? (status as ServiceStatus) : ServiceStatus.ACTIVE;

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [{ name: { contains: search, mode: 'insensitive' as const } }];
    }

    const services = await this.prisma.service.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const result = services.map(
      ({ imagePublicId: _pid, ...service }) => service,
    );
    await this.redis.set(cacheKey, result, TTL);
    return result;
  }

  async findOne(id: string) {
    const cacheKey = `services:one:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Only return active services to public
    if (service.status !== ServiceStatus.ACTIVE) {
      throw new NotFoundException('Service not found');
    }

    const { imagePublicId: _pid, ...publicService } = service;
    await this.redis.set(cacheKey, publicService, TTL);
    return publicService;
  }

  async findAllCategories() {
    const cacheKey = 'categories:all';
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const categories = await this.prisma.serviceCategory.findMany({
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            services: {
              where: {
                status: ServiceStatus.ACTIVE,
              },
            },
          },
        },
      },
    });

    const result = categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      serviceCount: category._count.services,
    }));
    await this.redis.set(cacheKey, result, TTL);
    return result;
  }

  async create(
    createServiceDto: CreateServiceDto,
    imageFile: Express.Multer.File,
  ) {
    const { categoryId, name, description, price, duration } = createServiceDto;

    if (!imageFile) {
      throw new BadRequestException('A service image is required.');
    }

    // Check if category exists
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    // Check for duplicate name in category
    const existingService = await this.prisma.service.findFirst({
      where: { categoryId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existingService) {
      throw new ConflictException(
        'Service with this name already exists in this category',
      );
    }

    // Upload image to Cloudinary (converted to WebP by CloudinaryService)
    const { secureUrl, publicId } = await this.cloudinary.uploadImage(
      imageFile.buffer,
      'hairlux/services',
    );

    const service = await this.prisma.service.create({
      data: {
        categoryId,
        name,
        description,
        price,
        duration,
        imageUrl: secureUrl,
        imagePublicId: publicId,
        status: ServiceStatus.ACTIVE,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    await this.redis.delByPattern('services:list:*');
    return service;
  }

  async update(
    id: string,
    updateServiceDto: UpdateServiceDto,
    imageFile?: Express.Multer.File,
  ) {
    const existingService = await this.prisma.service.findUnique({
      where: { id },
    });
    if (!existingService) throw new NotFoundException('Service not found');

    // Validate category if changing
    if (updateServiceDto.categoryId) {
      const category = await this.prisma.serviceCategory.findUnique({
        where: { id: updateServiceDto.categoryId },
      });
      if (!category) throw new NotFoundException('Category not found');
    }

    // Check for name duplicate if renaming
    if (updateServiceDto.name) {
      const duplicate = await this.prisma.service.findFirst({
        where: {
          id: { not: id },
          categoryId: updateServiceDto.categoryId || existingService.categoryId,
          name: { equals: updateServiceDto.name, mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          'Service with this name already exists in this category',
        );
      }
    }

    // Handle image replacement
    let imageUrl: string | undefined;
    let imagePublicId: string | undefined;
    if (imageFile) {
      const uploaded = await this.cloudinary.uploadImage(
        imageFile.buffer,
        'hairlux/services',
      );
      imageUrl = uploaded.secureUrl;
      imagePublicId = uploaded.publicId;

      // Delete old Cloudinary asset (non-fatal)
      if (existingService.imagePublicId) {
        await this.cloudinary.deleteImage(existingService.imagePublicId);
      }
    }

    const service = await this.prisma.service.update({
      where: { id },
      data: {
        ...updateServiceDto,
        ...(imageUrl && { imageUrl, imagePublicId }),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    await Promise.all([
      this.redis.delByPattern('services:list:*'),
      this.redis.del(`services:one:${id}`),
    ]);
    return service;
  }

  async updateStatus(id: string, status: ServiceStatus) {
    // Check if service exists
    const existingService = await this.prisma.service.findUnique({
      where: { id },
    });

    if (!existingService) {
      throw new NotFoundException('Service not found');
    }

    const service = await this.prisma.service.update({
      where: { id },
      data: { status },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    await Promise.all([
      this.redis.delByPattern('services:list:*'),
      this.redis.del(`services:one:${id}`),
    ]);
    return service;
  }

  async remove(id: string) {
    // Check if service exists
    const existingService = await this.prisma.service.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    if (!existingService) {
      throw new NotFoundException('Service not found');
    }

    // Check if service has bookings
    if (existingService._count.bookings > 0) {
      throw new ConflictException(
        'Cannot delete service with existing bookings. Consider deactivating it instead.',
      );
    }

    await this.prisma.service.delete({ where: { id } });

    // Clean up Cloudinary asset (non-fatal)
    if (existingService.imagePublicId) {
      await this.cloudinary.deleteImage(existingService.imagePublicId);
    }

    await Promise.all([
      this.redis.delByPattern('services:list:*'),
      this.redis.del(`services:one:${id}`),
    ]);
    return { message: 'Service deleted successfully' };
  }

  async createCategory(dto: CreateCategoryDto) {
    const existing = await this.prisma.serviceCategory.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    const category = await this.prisma.serviceCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
    });

    await Promise.all([
      this.redis.del('categories:all'),
      this.redis.delByPattern('services:list:*'),
    ]);
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.serviceCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Category not found');

    if (dto.name) {
      const duplicate = await this.prisma.serviceCategory.findFirst({
        where: {
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    const category = await this.prisma.serviceCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    await Promise.all([
      this.redis.del('categories:all'),
      this.redis.delByPattern('services:list:*'),
    ]);
    return category;
  }

  async removeCategory(id: string) {
    const existing = await this.prisma.serviceCategory.findUnique({
      where: { id },
      include: { _count: { select: { services: true } } },
    });
    if (!existing) throw new NotFoundException('Category not found');

    if (existing._count.services > 0) {
      throw new ConflictException(
        `Cannot delete category with ${existing._count.services} service(s) attached. Reassign or delete them first.`,
      );
    }

    await this.prisma.serviceCategory.delete({ where: { id } });

    await Promise.all([
      this.redis.del('categories:all'),
      this.redis.delByPattern('services:list:*'),
    ]);
    return { message: 'Category deleted successfully' };
  }
}
