import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BeauticianCommissionRateService } from './beautician-commission-rate.service';

describe('BeauticianCommissionRateService', () => {
  let service: BeauticianCommissionRateService;

  const mockPrisma = {
    beauticianCommissionRate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BeauticianCommissionRateService(mockPrisma as never);
  });

  it('builds a rate map only for beauticians with overrides', async () => {
    mockPrisma.beauticianCommissionRate.findMany.mockResolvedValue([
      { beauticianUserId: 'b-1', commissionRate: 0.6 },
    ]);

    const map = await service.getRateMapForBeauticianIds(['b-1', 'b-2', 'b-1']);

    expect(mockPrisma.beauticianCommissionRate.findMany).toHaveBeenCalledWith({
      where: { beauticianUserId: { in: ['b-1', 'b-2'] } },
      select: { beauticianUserId: true, commissionRate: true },
    });
    expect(map.get('b-1')).toBe(0.6);
    expect(map.has('b-2')).toBe(false);
  });

  it('returns an empty map when no beautician IDs are given', async () => {
    const map = await service.getRateMapForBeauticianIds([]);

    expect(map.size).toBe(0);
    expect(mockPrisma.beauticianCommissionRate.findMany).not.toHaveBeenCalled();
  });

  it('upserts an override for an existing beautician user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'b-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    mockPrisma.beauticianCommissionRate.upsert.mockResolvedValue({
      beauticianUserId: 'b-1',
      commissionRate: 0.6,
      updatedAt: new Date('2026-08-13T00:00:00.000Z'),
      beautician: { id: 'b-1', firstName: 'Ada', lastName: 'Lovelace' },
    });

    const result = await service.upsertOverride('b-1', 0.6);

    expect(result).toEqual({
      beauticianUserId: 'b-1',
      beauticianName: 'Ada Lovelace',
      commissionRate: 0.6,
      updatedAt: new Date('2026-08-13T00:00:00.000Z'),
    });
  });

  it('rejects invalid rates', async () => {
    await expect(service.upsertOverride('b-1', 1.5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws when beautician user does not exist on upsert', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(service.upsertOverride('missing', 0.1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes an existing override', async () => {
    mockPrisma.beauticianCommissionRate.findUnique.mockResolvedValue({
      id: 'row-1',
    });
    mockPrisma.beauticianCommissionRate.delete.mockResolvedValue({});

    await service.removeOverride('b-1');

    expect(mockPrisma.beauticianCommissionRate.delete).toHaveBeenCalledWith({
      where: { beauticianUserId: 'b-1' },
    });
  });

  it('throws when removing a missing override', async () => {
    mockPrisma.beauticianCommissionRate.findUnique.mockResolvedValue(null);
    await expect(service.removeOverride('b-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
