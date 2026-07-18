import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('../../../comms/services/comms-session.service', () => ({
  CommsSessionService: class CommsSessionService {},
}));
jest.mock('../../../comms/services/comms-realtime.service', () => ({
  CommsRealtimeService: class CommsRealtimeService {},
}));
jest.mock('./matching-orchestrator.service', () => ({
  MatchingOrchestratorService: class MatchingOrchestratorService {},
}));
jest.mock('./dispatch-state.service', () => ({
  DispatchStateService: class DispatchStateService {},
}));
jest.mock('./beautician-location-index.service', () => ({
  BeauticianLocationIndexService: class BeauticianLocationIndexService {},
}));
jest.mock('../../services/home-service-settings.service', () => ({
  HomeServiceSettingsService: class HomeServiceSettingsService {},
}));
jest.mock('../../payout/services/earnings-calculator.service', () => ({
  EarningsCalculatorService: class EarningsCalculatorService {},
}));
jest.mock('../../payout/services/service-commission-rate.service', () => ({
  ServiceCommissionRateService: class ServiceCommissionRateService {},
}));
jest.mock('../../../mail/mail.service', () => ({
  MailService: class MailService {},
}));

import { DispatchAdminService } from './dispatch-admin.service';

describe('DispatchAdminService timed probation', () => {
  let service: DispatchAdminService;

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockLocationIndex = { remove: jest.fn() };
  const mockMatchingOrchestrator = {
    cancelBeauticianPendingOffers: jest.fn(),
  };
  const mockMail = {
    sendBeauticianDispatchSuspensionEmail: jest.fn(),
  };
  const mockQueue = {
    add: jest.fn(),
    getJob: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueue.getJob.mockResolvedValue(null);
    mockQueue.add.mockResolvedValue({ id: 'job-1' });
    mockMail.sendBeauticianDispatchSuspensionEmail.mockResolvedValue(undefined);
    mockLocationIndex.remove.mockResolvedValue(undefined);
    mockMatchingOrchestrator.cancelBeauticianPendingOffers.mockResolvedValue(
      undefined,
    );

    service = new DispatchAdminService(
      mockPrisma as never,
      {} as never,
      mockMatchingOrchestrator as never,
      mockLocationIndex as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      mockMail as never,
      mockQueue as never,
    );
  });

  it('suspends with durationHours, schedules lift job, and emails beautician', async () => {
    const until = new Date(Date.now() + 48 * 60 * 60 * 1000);
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      dispatchSuspended: false,
      dispatchSuspendedUntil: null,
      dispatchSuspensionReason: null,
      user: { email: 'ada@example.com', firstName: 'Ada' },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      dispatchSuspended: true,
      dispatchSuspendedUntil: until,
      dispatchSuspensionReason: 'Poor review scores',
      availabilityStatus: 'OFFLINE',
    });

    const result = await service.updateDispatchSuspension('profile-1', {
      suspended: true,
      durationHours: 48,
      reason: 'Poor review scores',
    });

    expect(mockPrisma.beauticianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dispatchSuspended: true,
          dispatchSuspensionReason: 'Poor review scores',
        }),
      }),
    );
    expect(mockLocationIndex.remove).toHaveBeenCalledWith('user-1');
    expect(
      mockMatchingOrchestrator.cancelBeauticianPendingOffers,
    ).toHaveBeenCalledWith('user-1');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'lift-dispatch-suspension',
      expect.objectContaining({
        profileId: 'profile-1',
        userId: 'user-1',
      }),
      expect.objectContaining({
        jobId: 'dispatch-probation:profile-1',
        delay: expect.any(Number),
      }),
    );
    expect(mockMail.sendBeauticianDispatchSuspensionEmail).toHaveBeenCalledWith(
      'ada@example.com',
      expect.objectContaining({
        firstName: 'Ada',
        kind: 'SUSPENDED',
        reason: 'Poor review scores',
      }),
    );
    expect(result.dispatchSuspended).toBe(true);
    expect(result.message).toMatch(/until/i);
  });

  it('rejects until in the past', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      dispatchSuspended: false,
      dispatchSuspendedUntil: null,
      dispatchSuspensionReason: null,
      user: { email: 'a@b.com', firstName: 'A' },
    });

    await expect(
      service.updateDispatchSuspension('profile-1', {
        suspended: true,
        until: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('manual reinstate cancels job and emails REINSTATED', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      dispatchSuspended: true,
      dispatchSuspendedUntil: new Date(Date.now() + 3600_000),
      dispatchSuspensionReason: 'x',
      user: { email: 'ada@example.com', firstName: 'Ada' },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      dispatchSuspended: false,
      dispatchSuspendedUntil: null,
      dispatchSuspensionReason: null,
      availabilityStatus: 'OFFLINE',
    });
    const remove = jest.fn();
    mockQueue.getJob.mockResolvedValue({ remove });

    const result = await service.updateDispatchSuspension('profile-1', {
      suspended: false,
    });

    expect(remove).toHaveBeenCalled();
    expect(mockMail.sendBeauticianDispatchSuspensionEmail).toHaveBeenCalledWith(
      'ada@example.com',
      expect.objectContaining({ kind: 'REINSTATED', automatic: false }),
    );
    expect(result.dispatchSuspended).toBe(false);
  });

  it('auto-lift from job reinstate when until matches', async () => {
    const until = new Date(Date.now() - 1000);
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      dispatchSuspended: true,
      dispatchSuspendedUntil: until,
      dispatchSuspensionReason: 'probation',
      user: { email: 'ada@example.com', firstName: 'Ada' },
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      dispatchSuspended: false,
      dispatchSuspendedUntil: null,
      dispatchSuspensionReason: null,
      availabilityStatus: 'OFFLINE',
    });

    const result = await service.liftDispatchSuspensionFromJob({
      profileId: 'profile-1',
      userId: 'user-1',
      suspendedUntil: until.toISOString(),
    });

    expect(result).toEqual({ lifted: true });
    expect(mockMail.sendBeauticianDispatchSuspensionEmail).toHaveBeenCalledWith(
      'ada@example.com',
      expect.objectContaining({ kind: 'REINSTATED', automatic: true }),
    );
  });

  it('ignores stale probation job after until was changed', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      dispatchSuspended: true,
      dispatchSuspendedUntil: new Date(Date.now() + 86_400_000),
      dispatchSuspensionReason: 'extended',
      user: { email: 'ada@example.com', firstName: 'Ada' },
    });

    const result = await service.liftDispatchSuspensionFromJob({
      profileId: 'profile-1',
      userId: 'user-1',
      suspendedUntil: new Date(Date.now() - 1000).toISOString(),
    });

    expect(result).toEqual({ lifted: false, reason: 'stale_job' });
    expect(mockPrisma.beauticianProfile.update).not.toHaveBeenCalled();
    expect(
      mockMail.sendBeauticianDispatchSuspensionEmail,
    ).not.toHaveBeenCalled();
  });

  it('throws when profile missing', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.updateDispatchSuspension('missing', { suspended: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
