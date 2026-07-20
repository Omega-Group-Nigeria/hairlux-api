import { CandidateEligibilityService } from './candidate-eligibility.service';
import { HomeServiceStatusService } from '../../home-service-booking/home-service-status.service';
import { MatchingConfigService } from './matching-config.service';

describe('CandidateEligibilityService', () => {
  const homeServiceStatus = new HomeServiceStatusService();
  const matchingConfig = {
    getLocationStalenessMinutes: jest.fn().mockReturnValue(5),
    getOnJobOfferEligiblePercent: jest.fn().mockReturnValue(90),
  };

  const service = new CandidateEligibilityService(
    matchingConfig as never,
    homeServiceStatus,
  );

  const services = [
    {
      serviceId: 's1',
      name: 'Braids',
      price: 1000,
      quantity: 1,
      duration: 100,
    },
  ];

  it('requires all assigned services for capability', () => {
    expect(service.coversAllServices(['a', 'b'], ['a'])).toBe(true);
    expect(service.coversAllServices(['a'], ['a', 'b'])).toBe(false);
  });

  it('treats location as stale after configured minutes', () => {
    const now = new Date('2026-07-19T12:00:00.000Z');
    const fresh = new Date('2026-07-19T11:56:00.000Z');
    const stale = new Date('2026-07-19T11:50:00.000Z');

    expect(service.hasFreshLocation(fresh, now)).toBe(true);
    expect(service.hasFreshLocation(stale, now)).toBe(false);
    expect(service.hasFreshLocation(null, now)).toBe(false);
  });

  it('uses env/config percent for ON_JOB near-complete gate', () => {
    const started = new Date('2026-07-19T10:00:00.000Z');
    const at89 = new Date('2026-07-19T11:29:00.000Z');
    const at90 = new Date('2026-07-19T11:30:00.000Z');

    expect(service.isOnJobNearServiceComplete(started, services, at89)).toBe(
      false,
    );
    expect(service.isOnJobNearServiceComplete(started, services, at90)).toBe(
      true,
    );
  });
});
