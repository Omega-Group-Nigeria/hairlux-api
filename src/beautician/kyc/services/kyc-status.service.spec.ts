import { readFileSync } from 'fs';
import { join } from 'path';
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

  it('maps legacy webhook payloads to VERIFIED when auto-approve is enabled', async () => {
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

  it('maps QoreID workflow completion payloads to VERIFIED', async () => {
    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId,
      user: {
        id: userId,
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Okafor',
      },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      userId,
      kycStatus: KycStatus.VERIFIED,
      user: {
        id: userId,
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Okafor',
      },
    });

    await service.applyWebhookUpdate({
      event: 'workflow',
      event_type: 'verification_completed',
      data: {
        id: 45602,
        customerReference: `beautician-kyc-${userId}-1710000000000`,
        status: {
          status: 'Success',
          state: 'Complete',
          subStatus: '',
        },
      },
    });

    expect(mockPrisma.beauticianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        data: expect.objectContaining({
          kycStatus: KycStatus.VERIFIED,
          qoreIdCustomerId: '45602',
        }),
      }),
    );
    expect(mockNotification.notifyKycResult).toHaveBeenCalledWith(
      expect.any(Object),
      'VERIFIED',
    );
  });

  it('maps the QoreID sample response.json payload shape to VERIFIED', async () => {
    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const customerReference = `beautician-kyc-${userId}-1710000000000`;
    const samplePayload = JSON.parse(
      readFileSync(join(process.cwd(), 'response.json'), 'utf8'),
    ) as Record<string, unknown>;
    const data = samplePayload.data as Record<string, unknown>;
    data.customerReference = customerReference;

    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId,
      user: {
        id: userId,
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Okafor',
      },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      userId,
      kycStatus: KycStatus.VERIFIED,
      user: {
        id: userId,
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Okafor',
      },
    });

    await service.applyWebhookUpdate(samplePayload);

    expect(mockPrisma.beauticianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        data: expect.objectContaining({
          kycStatus: KycStatus.VERIFIED,
          qoreIdCustomerId: '45602',
          qoreIdCustomerReference: customerReference,
        }),
      }),
    );
  });

  it('resolves beauticians from a stored customer reference fallback', async () => {
    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const customerReference = `beautician-kyc-${userId}-1710000000000`;

    mockPrisma.beauticianProfile.findFirst.mockResolvedValueOnce({
      userId,
    });
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId,
      user: {
        id: userId,
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Okafor',
      },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      userId,
      kycStatus: KycStatus.VERIFIED,
      user: {
        id: userId,
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Okafor',
      },
    });

    await service.applyWebhookUpdate({
      event: 'workflow',
      event_type: 'verification_completed',
      data: {
        id: 45602,
        customerReference: 'custom-reference-without-uuid-pattern',
        status: {
          status: 'verified',
          state: 'complete',
        },
      },
    });

    expect(mockPrisma.beauticianProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { qoreIdCustomerReference: 'custom-reference-without-uuid-pattern' },
      }),
    );
    expect(mockPrisma.beauticianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
      }),
    );
  });

  it('acknowledges non-terminal workflow events without updating KYC', async () => {
    const result = await service.applyWebhookUpdate({
      event: 'workflow',
      event_type: 'step_verification_started',
      data: {
        customerReference: 'beautician-kyc-a1b2c3d4-e5f6-7890-abcd-ef1234567890-1710000000000',
        status: {
          status: 'in_progress',
          state: 'in_progress',
        },
      },
    });

    expect(result).toBeNull();
    expect(mockPrisma.beauticianProfile.update).not.toHaveBeenCalled();
    expect(mockNotification.notifyKycResult).not.toHaveBeenCalled();
  });
});