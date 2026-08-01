import { HomeServiceStatusService } from './home-service-status.service';

describe('HomeServiceStatusService service progress', () => {
  const service = new HomeServiceStatusService();

  const services = [
    {
      serviceId: 's1',
      name: 'Braids',
      price: 10000,
      quantity: 1,
      duration: 100,
    },
  ];

  it('returns false without serviceStartedAt', () => {
    expect(
      service.hasReachedServiceProgressPercent(null, services, 90),
    ).toBe(false);
  });

  it('returns false before the percent threshold', () => {
    const started = new Date('2026-07-19T10:00:00.000Z');
    const now = new Date('2026-07-19T11:29:00.000Z'); // 89 minutes of 100

    expect(
      service.hasReachedServiceProgressPercent(started, services, 90, now),
    ).toBe(false);
  });

  it('returns true at or after the percent threshold', () => {
    const started = new Date('2026-07-19T10:00:00.000Z');
    const now = new Date('2026-07-19T11:30:00.000Z'); // 90 minutes of 100

    expect(
      service.hasReachedServiceProgressPercent(started, services, 90, now),
    ).toBe(true);
  });
});
