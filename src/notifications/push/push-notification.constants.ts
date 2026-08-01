import { PUSH_EVENTS, type PushEventKey } from './push-event.types';

/**
 * Single source of truth for push titles and bodies.
 * Use `{{varName}}` placeholders; resolved by PushMessageFactory.
 */
export const PUSH_COPY: Record<
  PushEventKey,
  { title: string; body: string }
> = {
  // ── Wallet ───────────────────────────────────────────────────────────────
  [PUSH_EVENTS.WALLET_DEPOSIT_SUCCESS]: {
    title: 'Deposit successful',
    body: '₦{{amount}} has been added to your wallet.',
  },
  [PUSH_EVENTS.WALLET_PAYOUT_COMPLETED]: {
    title: 'Payout completed',
    body: '₦{{amount}} has been sent to your bank account.',
  },
  [PUSH_EVENTS.WALLET_PAYOUT_FAILED]: {
    title: 'Payout failed',
    body: 'Your payout of ₦{{amount}} could not be completed.{{reasonSuffix}}',
  },

  // ── Booking (customer) — §3.2 ────────────────────────────────────────────
  [PUSH_EVENTS.BOOKING_CONFIRMED]: {
    title: 'Booking confirmed',
    body: 'Your booking {{reservationCode}} is confirmed.',
  },
  [PUSH_EVENTS.BOOKING_BEAUTICIAN_ASSIGNED]: {
    title: 'Beautician assigned',
    body: 'A beautician has been assigned to your booking.',
  },
  [PUSH_EVENTS.BOOKING_EN_ROUTE]: {
    title: 'Beautician on the way',
    body: 'Your beautician is en route to your location.',
  },
  [PUSH_EVENTS.BOOKING_ARRIVED]: {
    title: 'Beautician has arrived',
    body: 'Please verify their arrival with the PIN in your app.',
  },
  [PUSH_EVENTS.BOOKING_COMPLETED]: {
    title: 'Service completed',
    body: 'Your booking is complete. Thanks for using HairLux!',
  },
  [PUSH_EVENTS.BOOKING_CANCELLED]: {
    title: 'Booking cancelled',
    body: 'Your booking {{reservationCode}} has been cancelled.',
  },

  // ── Job (beautician + completion request) — §3.3 ─────────────────────────
  [PUSH_EVENTS.JOB_OFFER]: {
    title: 'New job offer',
    body: 'You have a new home-service job. Est. earnings ₦{{estEarnings}}.',
  },
  [PUSH_EVENTS.JOB_OFFER_TAKEN]: {
    title: 'Job offer no longer available',
    body: 'Another beautician accepted this job.',
  },
  [PUSH_EVENTS.JOB_ARRIVAL_VERIFIED]: {
    title: 'Arrival confirmed',
    body: 'The customer verified your arrival. You can start the service.',
  },
  [PUSH_EVENTS.JOB_COMPLETION_REQUESTED]: {
    title: 'Confirm service completion',
    body: 'Your beautician marked the service complete. Please confirm in the app.',
  },
  [PUSH_EVENTS.JOB_COMPLETED]: {
    title: 'Job completed',
    body: 'Booking completed.{{ratingSuffix}}',
  },

  // ── Shop — §3.4 ──────────────────────────────────────────────────────────
  [PUSH_EVENTS.SHOP_ORDER_PLACED]: {
    title: 'Order placed',
    body: 'Your order {{orderCode}} has been placed successfully.',
  },
  [PUSH_EVENTS.SHOP_ORDER_CANCELLED]: {
    title: 'Order cancelled',
    body: 'Your order {{orderCode}} has been cancelled.',
  },
  [PUSH_EVENTS.SHOP_ORDER_SHIPPED]: {
    title: 'Order shipped',
    body: 'Your order {{orderCode}} is on its way.',
  },
  [PUSH_EVENTS.SHOP_ORDER_DELIVERED]: {
    title: 'Order delivered',
    body: 'Your order {{orderCode}} has been delivered.',
  },

  // ── Onboarding — §3.5 ────────────────────────────────────────────────────
  [PUSH_EVENTS.ONBOARDING_KYC_RESULT]: {
    title: 'KYC update',
    body: 'Your identity verification status is {{outcomeLabel}}.',
  },
  [PUSH_EVENTS.ONBOARDING_PROFILE_REVIEW]: {
    title: 'Profile review',
    body: 'Your professional profile was {{outcomeLabel}}.',
  },
};
