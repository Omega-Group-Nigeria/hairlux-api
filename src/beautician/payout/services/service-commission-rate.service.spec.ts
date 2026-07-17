import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServiceCommissionRateService } from './service-commission-rate.service';

describe('ServiceCommissionRateService', () => {
  let service: ServiceCommissionRateService;

  const mockPrisma = {
    serviceCommissionRate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    service: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ServiceCommissionRateService(mockPrisma as never);
  });

  it('builds a rate map only for services with overrides', async () => {
    mockPrisma.serviceCommissionRate.findMany.mockResolvedValue([
      { serviceId: 'svc-1', commissionRate: 0.03 },
    ]);

    const map = await service.getRateMapForServiceIds(['svc-1', 'svc-2', 'svc-1']);

    expect(mockPrisma.serviceCommissionRate.findMany).toHaveBeenCalledWith({
      where: { serviceId: { in: ['svc-1', 'svc-2'] } },
      select: { serviceId: true, commissionRate: true },
    });
    expect(map.get('svc-1')).toBe(0.03);
    expect(map.has('svc-2')).toBe(false);
  });

  it('loads rates from booking services JSON', async () => {
    mockPrisma.serviceCommissionRate.findMany.mockResolvedValue([
      { serviceId: 'svc-a', commissionRate: 0.05 },
    ]);

    const map = await service.getRateMapForBookingServices([
      {
        serviceId: 'svc-a',
        name: 'A',
        price: 1000,
        quantity: 1,
        duration: 30,
      },
      {
        serviceId: 'svc-b',
        name: 'B',
        price: 2000,
        quantity: 1,
        duration: 30,
      },
    ]);

    expect(map.get('svc-a')).toBe(0.05);
    expect(map.has('svc-b')).toBe(false);
  });

  it('upserts an override for an existing service', async () => {
    mockPrisma.service.findUnique.mockResolvedValue({
      id: 'svc-1',
      name: 'Luxury Style',
    });
    mockPrisma.serviceCommissionRate.upsert.mockResolvedValue({
      serviceId: 'svc-1',
      commissionRate: 0.04,
      updatedAt: new Date('2026-07-17T00:00:00.000Z'),
      service: { id: 'svc-1', name: 'Luxury Style' },
    });

    const result = await service.upsertOverride('svc-1', 0.04);

    expect(result).toEqual({
      serviceId: 'svc-1',
      serviceName: 'Luxury Style',
      commissionRate: 0.04,
      updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    });
  });

  it('rejects invalid rates', async () => {
    await expect(service.upsertOverride('svc-1', 1.5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockPrisma.service.findUnique).not.toHaveBeenCalled();
  });

  it('throws when service does not exist on upsert', async () => {
    mockPrisma.service.findUnique.mockResolvedValue(null);
    await expect(service.upsertOverride('missing', 0.1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes an existing override', async () => {
    mockPrisma.serviceCommissionRate.findUnique.mockResolvedValue({ id: 'row-1' });
    mockPrisma.serviceCommissionRate.delete.mockResolvedValue({});

    await service.removeOverride('svc-1');

    expect(mockPrisma.serviceCommissionRate.delete).toHaveBeenCalledWith({
      where: { serviceId: 'svc-1' },
    });
  });

  it('throws when removing a missing override', async () => {
    mockPrisma.serviceCommissionRate.findUnique.mockResolvedValue(null);
    await expect(service.removeOverride('svc-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
