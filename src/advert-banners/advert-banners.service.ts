import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { ADVERT_BANNERS_CLOUDINARY_FOLDER } from './advert-banners.constants';
import { CreateAdvertBannerDto } from './dto/create-advert-banner.dto';
import { ReorderAdvertBannersDto } from './dto/reorder-advert-banners.dto';
import { UpdateAdvertBannerDto } from './dto/update-advert-banner.dto';

@Injectable()
export class AdvertBannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /** Fixed public_id keeps every banner at a single Cloudinary asset path. */
  private bannerPublicId(id: string): string {
    return `banner-${id}`;
  }

  /** Public endpooint — only active banners, in carousel order. */
  async findPublicBanners() {
    return this.prisma.advertBanner.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, imageUrl: true, linkUrl: true },
    });
  }

  /** Admin — all banners (including inactive). */
  findAll() {
    return this.prisma.advertBanner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreateAdvertBannerDto, image?: Express.Multer.File) {
    if (!image) {
      throw new BadRequestException('Banner image is required');
    }

    const id = randomUUID();
    const upload = await this.cloudinary.uploadImage(
      image.buffer,
      ADVERT_BANNERS_CLOUDINARY_FOLDER,
      this.bannerPublicId(id),
    );

    const sortOrder = dto.sortOrder ?? (await this.resolveNextSortOrder());

    return this.prisma.advertBanner.create({
      data: {
        id,
        title: dto.title,
        imageUrl: upload.secureUrl,
        imagePublicId: upload.publicId,
        linkUrl: dto.linkUrl ?? null,
        isActive: dto.isActive ?? false,
        sortOrder,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateAdvertBannerDto,
    image?: Express.Multer.File,
  ) {
    const existing = await this.prisma.advertBanner.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Advert banner not found');
    }

    // When an image is provided it re-uploads to the same public_id, so
    // Cloudinary overwrites in place — no orphan assets accumulate.
    let imageUrl = existing.imageUrl;
    let imagePublicId = existing.imagePublicId;
    if (image) {
      const upload = await this.cloudinary.uploadImage(
        image.buffer,
        ADVERT_BANNERS_CLOUDINARY_FOLDER,
        this.bannerPublicId(id),
      );
      imageUrl = upload.secureUrl;
      imagePublicId = upload.publicId;
    }

    return this.prisma.advertBanner.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        imageUrl,
        imagePublicId,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.advertBanner.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Advert banner not found');
    }

    await this.prisma.advertBanner.delete({ where: { id } });

    // Non-fatal Cloudinary cleanup (missing asset never blocks deletion).
    await this.cloudinary.deleteImage(existing.imagePublicId);
  }

  async reorder(dto: ReorderAdvertBannersDto) {
    const existing = await this.prisma.advertBanner.findMany({
      where: { id: { in: dto.order.map((item) => item.id) } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((banner) => banner.id));
    const missing = dto.order
      .map((item) => item.id)
      .filter((bannerId) => !existingIds.has(bannerId));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Advert banner(s) not found: ${missing.join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      dto.order.map((item) =>
        this.prisma.advertBanner.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  private async resolveNextSortOrder(): Promise<number> {
    const last = await this.prisma.advertBanner.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return last ? last.sortOrder + 1 : 0;
  }
}
