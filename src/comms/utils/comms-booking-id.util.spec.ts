import {
  parseBookingIdFromStreamCallCid,
  parseBookingIdFromStreamChannelId,
} from './comms-booking-id.util';

describe('comms-booking-id.util', () => {
  it('parses booking id from stream channel id', () => {
    expect(
      parseBookingIdFromStreamChannelId('booking-550e8400-e29b-41d4-a716-446655440000'),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('parses booking id from stream call cid', () => {
    expect(
      parseBookingIdFromStreamCallCid(
        'default:booking-550e8400-e29b-41d4-a716-446655440000',
      ),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('returns null for unrelated channel ids', () => {
    expect(parseBookingIdFromStreamChannelId('support-general')).toBeNull();
  });
});