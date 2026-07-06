import { MatchingExhaustedReason } from '@prisma/client';

export const MATCHING_SEARCHING_NEAR_MESSAGE =
  'Finding the best beautician near you…';

/** @deprecated Use resolveSearchingMessage / MATCHING_SEARCHING_NEAR_MESSAGE */
export const MATCHING_SEARCHING_MESSAGE = MATCHING_SEARCHING_NEAR_MESSAGE;

export const MATCHING_SEARCHING_WIDE_MESSAGE =
  'Still looking — checking a wider area…';

export const MATCHING_EXHAUSTED_MESSAGES: Record<
  MatchingExhaustedReason,
  string
> = {
  NO_BEAUTICIANS_ONLINE:
    'No beauticians are online in your area right now. Please try again in a few minutes.',
  NO_CANDIDATES_IN_AREA:
    "We couldn't find any available beauticians in your area right now. Please try again in a few minutes.",
  OFFERS_NOT_ACCEPTED:
    'Beauticians nearby were notified, but none accepted this job. Please try again in a few minutes.',
  COVERAGE_GAP:
    'Beauticians are online, but none are close enough to reach you right now. Please try again shortly.',
};

export const MATCHING_EXHAUSTED_FALLBACK_MESSAGE =
  MATCHING_EXHAUSTED_MESSAGES.NO_CANDIDATES_IN_AREA;

export function resolveExhaustedMessage(
  reason?: MatchingExhaustedReason | null,
): string {
  if (!reason) {
    return MATCHING_EXHAUSTED_FALLBACK_MESSAGE;
  }

  return MATCHING_EXHAUSTED_MESSAGES[reason];
}

export function resolveSearchingMessage(matchingAttempt?: number | null): string {
  if (matchingAttempt != null && matchingAttempt >= 3) {
    return MATCHING_SEARCHING_WIDE_MESSAGE;
  }

  return MATCHING_SEARCHING_NEAR_MESSAGE;
}

export function resolveAssignmentStatusMessage(booking: {
  status: string;
  matchingAttempt?: number | null;
  matchingExhaustedAt?: Date | string | null;
  matchingExhaustedReason?: MatchingExhaustedReason | null;
}): string | null {
  if (
    booking.status === 'PENDING_ASSIGNMENT' &&
    booking.matchingExhaustedAt
  ) {
    return resolveExhaustedMessage(booking.matchingExhaustedReason);
  }

  if (booking.status === 'PENDING_ASSIGNMENT') {
    return resolveSearchingMessage(booking.matchingAttempt);
  }

  return null;
}

export function canRetryMatching(booking: {
  status: string;
  matchingExhaustedAt?: Date | string | null;
}): boolean {
  return (
    booking.status === 'PENDING_ASSIGNMENT' &&
    Boolean(booking.matchingExhaustedAt)
  );
}