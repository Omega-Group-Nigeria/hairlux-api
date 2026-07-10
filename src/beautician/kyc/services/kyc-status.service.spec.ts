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
        customerReference: userId,
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

  it('resolves beauticians when QoreID sends userId as customerReference', async () => {
    const userId = '2028c5bb-bcee-4708-9cce-949faf44ad51';

    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId,
      user: {
        id: userId,
        email: 'ayomide@example.com',
        firstName: 'Ayomide',
        lastName: 'Yusuff',
      },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      userId,
      kycStatus: KycStatus.VERIFIED,
      user: {
        id: userId,
        email: 'ayomide@example.com',
        firstName: 'Ayomide',
        lastName: 'Yusuff',
      },
    });

    await service.applyWebhookUpdate({
      event: 'workflow',
      event_type: 'verification_completed',
      data: {
        id: 49430,
        customerReference: userId,
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
          qoreIdCustomerId: '49430',
        }),
      }),
    );
    expect(mockPrisma.beauticianProfile.findFirst).not.toHaveBeenCalled();
  });

  it('maps the QoreID workflow webhook payload shape to VERIFIED', async () => {
    const userId = '2028c5bb-bcee-4708-9cce-949faf44ad51';

    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId,
      user: {
        id: userId,
        email: 'ayomide@example.com',
        firstName: 'Ayomide',
        lastName: 'Yusuff',
      },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      userId,
      kycStatus: KycStatus.VERIFIED,
      user: {
        id: userId,
        email: 'ayomide@example.com',
        firstName: 'Ayomide',
        lastName: 'Yusuff',
      },
    });

    await service.applyWebhookUpdate({
      event: 'workflow',
      event_type: 'verification_completed',
      data: {
        id: 45602,
        customerReference: userId,
        applicant: {
          customerReference: userId,
          firstname: 'Ayomide',
          lastname: 'Yusuff',
        },
        status: {
          status: 'Success',
          state: 'Complete',
          subStatus: '',
        },
        summary: {
          nin_check: {
            status: 'PARTIAL_MATCH',
          },
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
  });

  it('resolves beauticians from applicant.customerReference', async () => {
    const userId = '2028c5bb-bcee-4708-9cce-949faf44ad51';

    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId,
      user: {
        id: userId,
        email: 'ayomide@example.com',
        firstName: 'Ayomide',
        lastName: 'Yusuff',
      },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      userId,
      kycStatus: KycStatus.VERIFIED,
      user: {
        id: userId,
        email: 'ayomide@example.com',
        firstName: 'Ayomide',
        lastName: 'Yusuff',
      },
    });

    await service.applyWebhookUpdate({
      event: 'workflow',
      event_type: 'verification_completed',
      data: {
        id: 49430,
        applicant: {
          customerReference: userId,
        },
        status: {
          status: 'verified',
          state: 'complete',
        },
      },
    });

    expect(mockPrisma.beauticianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
      }),
    );
  });

  it('rejects verification_completed webhooks with an unresolvable customerReference', async () => {
    await expect(
      service.applyWebhookUpdate({
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
      }),
    ).rejects.toThrow('Unable to resolve beautician from webhook');

    expect(mockPrisma.beauticianProfile.update).not.toHaveBeenCalled();
  });

  it('acknowledges non-terminal workflow events without updating KYC', async () => {
    const result = await service.applyWebhookUpdate({
      event: 'workflow',
      event_type: 'step_verification_started',
      data: {
        customerReference: '2028c5bb-bcee-4708-9cce-949faf44ad51',
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