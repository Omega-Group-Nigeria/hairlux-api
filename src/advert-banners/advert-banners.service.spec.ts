import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdvertBannersService } from './advert-banners.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ADVERT_BANNERS_CLOUDINARY_FOLDER } from './advert-banners.constants';

describe('AdvertBannersService', () => {
  let service: AdvertBannersService;

  const mockPrisma = {
    advertBanner: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((ops) => Promise.all(ops)),
  };

  const mockCloudinary = {
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
  };

  const imageFile = {
    buffer: Buffer.from('fake-image'),
  } as Express.Multer.File;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvertBannersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CloudinaryService, useValue: mockCloudinary },
      ],
    }).compile();

    service = module.get<AdvertBannersService>(AdvertBannersService);
  });

  describe('findPublicBanners', () => {
    it('returns only active banners sorted by sortOrder then createdAt', async () => {
      const banners = [
        { id: '2', title: 'Second', imageUrl: 'u2', linkUrl: null },
        { id: '1', title: 'First', imageUrl: 'u1', linkUrl: 'https://x' },
      ];
      mockPrisma.advertBanner.findMany.mockResolvedValue(banners);

      const result = await service.findPublicBanners();

      expect(mockPrisma.advertBanner.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, title: true, imageUrl: true, linkUrl: true },
      });
      expect(result).toEqual(banners);
    });
  });

  describe('create', () => {
    it('rejects when no image is provided', async () => {
      await expect(service.create({ title: 'No image' })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockCloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('uploads image, defaults isActive to false and appends to the end', async () => {
      mockCloudinary.uploadImage.mockResolvedValue({
        secureUrl: 'https://cdn.example.com/advert-banners/banner-x.webp',
        publicId: 'advert-banners/banner-x',
      });
      mockPrisma.advertBanner.findFirst.mockResolvedValue({ sortOrder: 2 });
      mockPrisma.advertBanner.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const result = await service.create({ title: 'Spring Sale' }, imageFile);

      expect(mockCloudinary.uploadImage).toHaveBeenCalledWith(
        imageFile.buffer,
        ADVERT_BANNERS_CLOUDINARY_FOLDER,
        expect.any(String),
      );
      expect(mockPrisma.advertBanner.create).toHaveBeenCalled();
      const created = mockPrisma.advertBanner.create.mock.calls[0][0].data;
      expect(created.title).toBe('Spring Sale');
      expect(created.isActive).toBe(false);
      expect(created.sortOrder).toBe(3);
      expect(result.id).toBeDefined();
    });

    it('uses provided sortOrder and isActive when given', async () => {
      mockCloudinary.uploadImage.mockResolvedValue({
        secureUrl: 'https://cdn.example.com/1.webp',
        publicId: 'advert-banners/banner-y',
      });
      mockPrisma.advertBanner.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      await service.create(
        { title: 'Launch', isActive: true, sortOrder: 0 },
        imageFile,
      );

      const created = mockPrisma.advertBanner.create.mock.calls[0][0].data;
      expect(created.isActive).toBe(true);
      expect(created.sortOrder).toBe(0);
      expect(mockPrisma.advertBanner.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFound when banner does not exist', async () => {
      mockPrisma.advertBanner.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('overwrites the Cloudinary asset in place when a new image is given', async () => {
      mockPrisma.advertBanner.findUnique.mockResolvedValue({
        id: 'banner-1',
        imageUrl: 'old',
        imagePublicId: 'advert-banners/banner-1',
      });
      mockCloudinary.uploadImage.mockResolvedValue({
        secureUrl: 'https://cdn.example.com/new.webp',
        publicId: 'advert-banners/banner-1',
      });
      mockPrisma.advertBanner.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'banner-1', ...data }),
      );

      await service.update('banner-1', { title: 'New Title' }, imageFile);

      expect(mockCloudinary.uploadImage).toHaveBeenCalledWith(
        imageFile.buffer,
        ADVERT_BANNERS_CLOUDINARY_FOLDER,
        'banner-banner-1',
      );
      const data = mockPrisma.advertBanner.update.mock.calls[0][0].data;
      expect(data.title).toBe('New Title');
      expect(data.imageUrl).toBe('https://cdn.example.com/new.webp');
    });

    it('only touches provided fields and keeps existing image', async () => {
      mockPrisma.advertBanner.findUnique.mockResolvedValue({
        id: 'banner-1',
        imageUrl: 'old',
        imagePublicId: 'advert-banners/banner-1',
      });
      mockPrisma.advertBanner.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'banner-1', ...data }),
      );

      await service.update('banner-1', { isActive: true });

      expect(mockCloudinary.uploadImage).not.toHaveBeenCalled();
      const data = mockPrisma.advertBanner.update.mock.calls[0][0].data;
      expect(data.isActive).toBe(true);
      expect(data.title).toBeUndefined();
      expect(data.imageUrl).toBe('old');
    });
  });

  describe('remove', () => {
    it('throws NotFound when banner does not exist', async () => {
      mockPrisma.advertBanner.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes the banner and its Cloudinary asset', async () => {
      mockPrisma.advertBanner.findUnique.mockResolvedValue({
        id: 'banner-1',
        imagePublicId: 'advert-banners/banner-1',
      });
      mockPrisma.advertBanner.delete.mockResolvedValue({ id: 'banner-1' });

      await service.remove('banner-1');

      expect(mockPrisma.advertBanner.delete).toHaveBeenCalledWith({
        where: { id: 'banner-1' },
      });
      expect(mockCloudinary.deleteImage).toHaveBeenCalledWith(
        'advert-banners/banner-1',
      );
    });
  });

  describe('reorder', () => {
    it('rejects unknown banner ids', async () => {
      mockPrisma.advertBanner.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
      ]);

      await expect(
        service.reorder({
          order: [
            { id: 'a', sortOrder: 0 },
            { id: 'c', sortOrder: 1 },
          ],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates every banner sortOrder inside a transaction', async () => {
      mockPrisma.advertBanner.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
      ]);
      mockPrisma.advertBanner.update.mockImplementation(({ data }) =>
        Promise.resolve(data),
      );

      await service.reorder({
        order: [
          { id: 'b', sortOrder: 0 },
          { id: 'a', sortOrder: 1 },
        ],
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = mockPrisma.$transaction.mock.calls[0][0];
      expect(ops).toHaveLength(2);
      const results = await Promise.all(ops);
      expect(results[0]).toEqual({ sortOrder: 0 });
      expect(results[1]).toEqual({ sortOrder: 1 });
    });
  });
});
