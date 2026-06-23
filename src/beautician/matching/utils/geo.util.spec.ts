import { haversineKm } from './geo.util';

describe('geo.util', () => {
  it('returns zero distance for identical coordinates', () => {
    expect(haversineKm(6.5244, 3.3792, 6.5244, 3.3792)).toBeCloseTo(0, 5);
  });

  it('computes known Lagos to Abuja distance approximately', () => {
    const distance = haversineKm(6.5244, 3.3792, 9.0765, 7.3986);
    expect(distance).toBeGreaterThan(500);
    expect(distance).toBeLessThan(560);
  });
});