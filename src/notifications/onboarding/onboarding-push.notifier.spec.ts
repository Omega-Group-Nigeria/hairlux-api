import { OnboardingPushNotifier } from './onboarding-push.notifier';
import { PUSH_EVENTS } from '../push/push-event.types';

describe('OnboardingPushNotifier', () => {
  const dispatch = {
    sendEvent: jest.fn().mockResolvedValue({ sent: 1, skipped: false }),
  };
  let notifier: OnboardingPushNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    notifier = new OnboardingPushNotifier(dispatch as never);
  });

  it('notifies kyc verified / rejected / needs review', async () => {
    notifier.notifyKycResult({
      beauticianUserId: 'be1',
      outcome: 'VERIFIED',
    });
    notifier.notifyKycResult({
      beauticianUserId: 'be1',
      outcome: 'REJECTED',
      reason: 'Blurry ID',
    });
    notifier.notifyKycResult({
      beauticianUserId: 'be1',
      outcome: 'NEEDS_REVIEW',
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.ONBOARDING_KYC_RESULT,
      { outcomeLabel: 'verified' },
      { outcome: 'VERIFIED' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.ONBOARDING_KYC_RESULT,
      { outcomeLabel: 'rejected' },
      { outcome: 'REJECTED', reason: 'Blurry ID' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.ONBOARDING_KYC_RESULT,
      { outcomeLabel: 'needs review' },
      { outcome: 'NEEDS_REVIEW' },
    );
  });

  it('notifies profile review outcomes including VIDEO_ONLY', async () => {
    notifier.notifyProfileReview({
      beauticianUserId: 'be1',
      outcome: 'APPROVED',
    });
    notifier.notifyProfileReview({
      beauticianUserId: 'be1',
      outcome: 'REJECTED',
      notes: 'Incomplete portfolio',
    });
    notifier.notifyProfileReview({
      beauticianUserId: 'be1',
      outcome: 'VIDEO_ONLY',
      notes: 'Too dark',
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.ONBOARDING_PROFILE_REVIEW,
      { outcomeLabel: 'approved' },
      { outcome: 'APPROVED' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.ONBOARDING_PROFILE_REVIEW,
      { outcomeLabel: 'rejected' },
      { outcome: 'REJECTED', notes: 'Incomplete portfolio' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.ONBOARDING_PROFILE_REVIEW,
      {
        outcomeLabel:
          'not accepted for the intro video — please re-upload',
      },
      { outcome: 'VIDEO_ONLY', notes: 'Too dark' },
    );
  });
});
