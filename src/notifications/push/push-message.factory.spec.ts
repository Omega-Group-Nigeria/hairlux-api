import { PushMessageFactory } from './push-message.factory';
import { PUSH_EVENTS } from './push-event.types';

describe('PushMessageFactory', () => {
  const factory = new PushMessageFactory();

  it('resolves wallet deposit copy with amount', () => {
    const msg = factory.resolve(PUSH_EVENTS.WALLET_DEPOSIT_SUCCESS, {
      amount: factory.formatAmount(5000),
    });

    expect(msg.type).toBe('wallet.deposit_success');
    expect(msg.title).toBe('Deposit successful');
    expect(msg.body).toBe('₦5,000 has been added to your wallet.');
  });

  it('soft-replaces missing template vars with empty string', () => {
    const msg = factory.resolve(PUSH_EVENTS.WALLET_PAYOUT_FAILED, {
      amount: '1,000',
      // reasonSuffix omitted
    });

    expect(msg.body).toBe(
      'Your payout of ₦1,000 could not be completed.',
    );
  });

  it('appends reason suffix for failed payout', () => {
    const msg = factory.resolve(PUSH_EVENTS.WALLET_PAYOUT_FAILED, {
      amount: '2,500',
      reasonSuffix: ' Bank rejected transfer.',
    });

    expect(msg.body).toContain('Bank rejected transfer.');
  });

  it('resolves booking confirmed with reservation code', () => {
    const msg = factory.resolve(PUSH_EVENTS.BOOKING_CONFIRMED, {
      reservationCode: 'HLX-123',
    });

    expect(msg.type).toBe('booking.confirmed');
    expect(msg.title).toBe('Booking confirmed');
    expect(msg.body).toBe('Your booking HLX-123 is confirmed.');
  });

  it('resolves booking lifecycle events', () => {
    expect(
      factory.resolve(PUSH_EVENTS.BOOKING_BEAUTICIAN_ASSIGNED).title,
    ).toBe('Beautician assigned');
    expect(factory.resolve(PUSH_EVENTS.BOOKING_EN_ROUTE).title).toBe(
      'Beautician on the way',
    );
    expect(factory.resolve(PUSH_EVENTS.BOOKING_ARRIVED).title).toBe(
      'Beautician has arrived',
    );
    expect(factory.resolve(PUSH_EVENTS.BOOKING_COMPLETED).title).toBe(
      'Service completed',
    );
    expect(
      factory.resolve(PUSH_EVENTS.BOOKING_CANCELLED, {
        reservationCode: 'HLX-9',
      }).body,
    ).toBe('Your booking HLX-9 has been cancelled.');
  });

  it('resolves job offer and completed with optional rating', () => {
    const offer = factory.resolve(PUSH_EVENTS.JOB_OFFER, {
      estEarnings: factory.formatAmount(15000),
    });
    expect(offer.type).toBe('job.offer');
    expect(offer.body).toContain('15,000');

    const withRating = factory.resolve(PUSH_EVENTS.JOB_COMPLETED, {
      ratingSuffix: ' Customer rating: 5/5.',
    });
    expect(withRating.body).toBe(
      'Booking completed. Customer rating: 5/5.',
    );

    const noRating = factory.resolve(PUSH_EVENTS.JOB_COMPLETED, {
      ratingSuffix: '',
    });
    expect(noRating.body).toBe('Booking completed.');

    expect(
      factory.resolve(PUSH_EVENTS.JOB_COMPLETION_REQUESTED).title,
    ).toBe('Confirm service completion');
  });

  it('resolves shop order events with order code', () => {
    expect(
      factory.resolve(PUSH_EVENTS.SHOP_ORDER_PLACED, {
        orderCode: 'SHP-99',
      }).body,
    ).toBe('Your order SHP-99 has been placed successfully.');
    expect(
      factory.resolve(PUSH_EVENTS.SHOP_ORDER_SHIPPED, {
        orderCode: 'SHP-99',
      }).body,
    ).toBe('Your order SHP-99 is on its way.');
    expect(
      factory.resolve(PUSH_EVENTS.SHOP_ORDER_DELIVERED, {
        orderCode: 'SHP-99',
      }).body,
    ).toBe('Your order SHP-99 has been delivered.');
    expect(
      factory.resolve(PUSH_EVENTS.SHOP_ORDER_CANCELLED, {
        orderCode: 'SHP-99',
      }).body,
    ).toBe('Your order SHP-99 has been cancelled.');
  });

  it('resolves onboarding kyc and profile review copy', () => {
    expect(
      factory.resolve(PUSH_EVENTS.ONBOARDING_KYC_RESULT, {
        outcomeLabel: 'verified',
      }).body,
    ).toBe('Your identity verification status is verified.');
    expect(
      factory.resolve(PUSH_EVENTS.ONBOARDING_PROFILE_REVIEW, {
        outcomeLabel: 'approved',
      }).body,
    ).toBe('Your professional profile was approved.');
  });
});
