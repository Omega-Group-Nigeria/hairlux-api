import { Test, TestingModule } from '@nestjs/testing';
import { KycStatus } from '@prisma/client';
import { KycStatusService } from './kyc-status.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';

describe('KycStatusService', () => {
  let service: KycStatusService;

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    homeServiceSettings: {
      findFirst: jest.fn().mockResolvedValue({ kycAutoApprove: true }),
    },
  };

  const mockNotification = { notifyKycResult: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycStatusService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BeauticianNotificationService, useValue: mockNotification },
      ],
    }).compile();

    service = module.get<KycStatusService>(KycStatusService);
  });

  it('maps successful webhook to VERIFIED when auto-approve is enabled', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId: 'user-1',
      user: {
        id: 'user-1',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Okafor',
      },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      userId: 'user-1',
      kycStatus: KycStatus.VERIFIED,
      user: {
        id: 'user-1',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Okafor',
      },
    });

    await service.applyWebhookUpdate({
      data: {
        subjectRef: 'user-1',
        status: 'verified',
      },
    });

    expect(mockPrisma.beauticianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        data: expect.objectContaining({ kycStatus: KycStatus.VERIFIED }),
      }),
    );
    expect(mockNotification.notifyKycResult).toHaveBeenCalledWith(
      expect.any(Object),
      'VERIFIED',
    );
  });
});