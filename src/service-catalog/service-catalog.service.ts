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
import { BookingType, ServiceStatus } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import { BranchCatalogService } from '../branch/services/branch-catalog.service';
import { resolveBranchWalkInPrice } from '../branch/utils/branch-pricing.utils';

const TTL = 300; // 5 minutes
const CATEGORY_IMAGE_FOLDER = 'hairlux/service-categories';

const categorySelect = {
  id: true,
  name: true,
  description: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ServiceCatalogService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private redis: RedisService,
    private branchCatalogService: BranchCatalogService,
  ) {}

  private mapPublicService(
    service: {
      walkInPrice: { toNumber: () => number } | number;
      homeServicePrice: { toNumber: () => number } | number;
      isWalkInAvailable: boolean;
      isHomeServiceAvailable: boolean;
      imagePublicId?: string | null;
      [key: string]: unknown;
    },
    bookingType?: BookingType,
  ) {
    const walkInPrice =
      typeof service.walkInPrice === 'number'
        ? service.walkInPrice
        : service.walkInPrice.toNumber();
    const homeServicePrice =
      typeof service.homeServicePrice === 'number'
        ? service.homeServicePrice
        : service.homeServicePrice.toNumber();

    const { imagePublicId: _pid, ...rest } = service as typeof service & {
      imagePublicId?: string | null;
    };

    return {
      ...rest,
      walkInPrice,
      homeServicePrice,
      ...(bookingType
        ? {
            effectivePrice:
              bookingType === BookingType.WALK_IN
                ? walkInPrice
                : homeServicePrice,
          }
        : {}),
    };
  }

  private ensureAtLeastOneReservationType(
    isWalkInAvailable: boolean,
    isHomeServiceAvailable: boolean,
  ) {
    if (!isWalkInAvailable && !isHomeServiceAvailable) {
      throw new BadRequestException(
        'At least one reservation type must be enabled for a service',
      );
    }
  }

  async findAll(queryDto: QueryServicesDto) {
    const cacheKey = `services:list:${JSON.stringify(queryDto)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const { categoryId, search, status, bookingType, branchId } = queryDto;

    // Build where clause
    const where: {
      status?: ServiceStatus;
      categoryId?: string;
      isWalkInAvailable?: boolean;
      isHomeServiceAvailable?: boolean;
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

    if (bookingType === BookingType.WALK_IN) {
      where.isWalkInAvailable = true;
    }

    if (bookingType === BookingType.HOME_SERVICE) {
      where.isHomeServiceAvailable = true;
    }

    let assignmentMap: Map<
      string,
      { serviceId: string; isAvailable: boolean; walkInPrice: unknown }
    > | null = null;

    if (branchId) {
      await this.branchCatalogService.assertOpenBranch(branchId);
      assignmentMap =
        await this.branchCatalogService.getAvailableAssignmentsMap(branchId);
    }

    const services = await this.prisma.service.findMany({
      where,
      include: {
        category: { select: categorySelect },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const scopedServices = branchId
      ? services.filter((service) => assignmentMap?.has(service.id))
      : services;

    const result = scopedServices.map((service) =>
      this.mapPublicService(
        this.applyBranchWalkInPrice(service, assignmentMap?.get(service.id)),
        bookingType,
      ),
    );
    await this.redis.set(cacheKey, result, TTL);
    return result;
  }

  async findOne(
    id: string,
    bookingType?: BookingType,
    branchId?: string,
  ) {
    const cacheKey = `services:one:${id}:${bookingType ?? 'all'}:${branchId ?? 'global'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        category: { select: categorySelect },
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Only return active services to public
    if (service.status !== ServiceStatus.ACTIVE) {
      throw new NotFoundException('Service not found');
    }

    if (bookingType === BookingType.WALK_IN && !service.isWalkInAvailable) {
      throw new NotFoundException('Service not available for WALK_IN');
    }

    if (
      bookingType === BookingType.HOME_SERVICE &&
      !service.isHomeServiceAvailable
    ) {
      throw new NotFoundException('Service not available for HOME_SERVICE');
    }

    let assignment:
      | { serviceId: string; isAvailable: boolean; walkInPrice: unknown }
      | undefined;

    if (branchId) {
      await this.branchCatalogService.assertOpenBranch(branchId);
      assignment =
        (await this.branchCatalogService.getAssignmentForService(
          branchId,
          id,
        )) ?? undefined;

      if (!assignment?.isAvailable) {
        throw new NotFoundException('Service not found');
      }
    }

    const publicService = this.mapPublicService(
      this.applyBranchWalkInPrice(service, assignment),
      bookingType,
    );
    await this.redis.set(cacheKey, publicService, TTL);
    return publicService;
  }

  private applyBranchWalkInPrice<T extends { walkInPrice: unknown }>(
    service: T,
    assignment?: { walkInPrice: unknown } | null,
  ): T {
    if (!assignment) {
      return service;
    }

    return {
      ...service,
      walkInPrice: resolveBranchWalkInPrice(
        service as T & { walkInPrice: { toNumber: () => number } | number },
        assignment as { walkInPrice: { toNumber: () => number } | number | null },
      ),
    };
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
        imageUrl: true,
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
      imageUrl: category.imageUrl,
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
    const {
      categoryId,
      name,
      description,
      walkInPrice,
      homeServicePrice,
      isWalkInAvailable,
      isHomeServiceAvailable,
      duration,
    } = createServiceDto;

    this.ensureAtLeastOneReservationType(
      isWalkInAvailable,
      isHomeServiceAvailable,
    );

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
        walkInPrice,
        homeServicePrice,
        isWalkInAvailable,
        isHomeServiceAvailable,
        duration,
        imageUrl: secureUrl,
        imagePublicId: publicId,
        status: ServiceStatus.ACTIVE,
      },
      include: {
        category: { select: categorySelect },
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

    const nextIsWalkInAvailable =
      updateServiceDto.isWalkInAvailable ?? existingService.isWalkInAvailable;
    const nextIsHomeServiceAvailable =
      updateServiceDto.isHomeServiceAvailable ??
      existingService.isHomeServiceAvailable;
    this.ensureAtLeastOneReservationType(
      nextIsWalkInAvailable,
      nextIsHomeServiceAvailable,
    );

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
        category: { select: categorySelect },
      },
    });

    await Promise.all([
      this.redis.delByPattern('services:list:*'),
      this.redis.delByPattern(`services:one:${id}:*`),
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
        category: { select: categorySelect },
      },
    });

    await Promise.all([
      this.redis.delByPattern('services:list:*'),
      this.redis.delByPattern(`services:one:${id}:*`),
    ]);
    return service;
  }

  async remove(id: string) {
    // Check if service exists
    const existingService = await this.prisma.service.findUnique({
      where: { id },
    });

    if (!existingService) {
      throw new NotFoundException('Service not found');
    }

    await this.prisma.service.delete({ where: { id } });

    // Clean up Cloudinary asset (non-fatal)
    if (existingService.imagePublicId) {
      await this.cloudinary.deleteImage(existingService.imagePublicId);
    }

    await Promise.all([
      this.redis.delByPattern('services:list:*'),
      this.redis.delByPattern(`services:one:${id}:*`),
    ]);
    return { message: 'Service deleted successfully' };
  }

  async createCategory(
    dto: CreateCategoryDto,
    imageFile: Express.Multer.File,
  ) {
    if (!imageFile) {
      throw new BadRequestException('A category image is required.');
    }

    const existing = await this.prisma.serviceCategory.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    const { secureUrl, publicId } = await this.cloudinary.uploadImage(
      imageFile.buffer,
      CATEGORY_IMAGE_FOLDER,
    );

    const category = await this.prisma.serviceCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        imageUrl: secureUrl,
        imagePublicId: publicId,
      },
    });

    await Promise.all([
      this.redis.del('categories:all'),
      this.redis.delByPattern('services:list:*'),
    ]);
    return category;
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    imageFile?: Express.Multer.File,
  ) {
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

    let imageUrl: string | undefined;
    let imagePublicId: string | undefined;
    if (imageFile) {
      const uploaded = await this.cloudinary.uploadImage(
        imageFile.buffer,
        CATEGORY_IMAGE_FOLDER,
      );
      imageUrl = uploaded.secureUrl;
      imagePublicId = uploaded.publicId;

      if (existing.imagePublicId) {
        await this.cloudinary.deleteImage(existing.imagePublicId);
      }
    }

    const category = await this.prisma.serviceCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(imageUrl && { imageUrl, imagePublicId }),
      },
    });

    await Promise.all([
      this.redis.del('categories:all'),
      this.redis.delByPattern('services:list:*'),
      this.redis.delByPattern('services:one:*'),
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

    if (existing.imagePublicId) {
      await this.cloudinary.deleteImage(existing.imagePublicId);
    }

    await Promise.all([
      this.redis.del('categories:all'),
      this.redis.delByPattern('services:list:*'),
    ]);
    return { message: 'Category deleted successfully' };
  }
}
