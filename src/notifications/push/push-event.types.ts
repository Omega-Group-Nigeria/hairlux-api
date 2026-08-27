/**
 * Stable push event keys sent as FCM `data.type`.
 * Apps deep-link on these strings — do not rename lightly.
 */
export const PUSH_EVENTS = {
  // Wallet
  WALLET_DEPOSIT_SUCCESS: 'wallet.deposit_success',
  WALLET_PAYOUT_COMPLETED: 'wallet.payout_completed',
  WALLET_PAYOUT_FAILED: 'wallet.payout_failed',

  // Booking (customer) — §3.2
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_BEAUTICIAN_ASSIGNED: 'booking.beautician_assigned',
  BOOKING_EN_ROUTE: 'booking.en_route',
  BOOKING_ARRIVED: 'booking.arrived',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_CANCELLED: 'booking.cancelled',

  // Job (beautician + completion request to customer) — §3.3
  JOB_OFFER: 'job.offer',
  JOB_OFFER_TAKEN: 'job.offer_taken',
  JOB_OFFER_EXPIRED: 'job.offer_expired',
  JOB_ARRIVAL_VERIFIED: 'job.arrival_verified',
  JOB_COMPLETION_REQUESTED: 'job.completion_requested',
  JOB_COMPLETED: 'job.completed',

  // Shop — §3.4
  SHOP_ORDER_PLACED: 'shop.order_placed',
  SHOP_ORDER_CANCELLED: 'shop.order_cancelled',
  SHOP_ORDER_SHIPPED: 'shop.order_shipped',
  SHOP_ORDER_DELIVERED: 'shop.order_delivered',

  // Onboarding (beautician) — §3.5
  ONBOARDING_KYC_RESULT: 'onboarding.kyc_result',
  ONBOARDING_PROFILE_REVIEW: 'onboarding.profile_review',
} as const;

export type PushEventKey = (typeof PUSH_EVENTS)[keyof typeof PUSH_EVENTS];

export type PushTemplateVars = Record<string, string | number | undefined | null>;
