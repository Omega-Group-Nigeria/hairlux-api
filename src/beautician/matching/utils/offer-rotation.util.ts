import { MatchingCandidate } from '../services/candidate-finder.service';

export function pickNextCandidateInRotation(
  ranked: MatchingCandidate[],
  rotateAfterBeauticianUserId?: string | null,
): MatchingCandidate | null {
  const top = pickTopCandidatesInRotation(
    ranked,
    rotateAfterBeauticianUserId,
    1,
  );
  return top[0] ?? null;
}

/**
 * Take up to `limit` candidates from the ranked list, rotating after the last
 * offered beautician so expired candidates cycle fairly.
 */
export function pickTopCandidatesInRotation(
  ranked: MatchingCandidate[],
  rotateAfterBeauticianUserId: string | null | undefined,
  limit: number,
): MatchingCandidate[] {
  if (!ranked.length || limit <= 0) {
    return [];
  }

  const cap = Math.min(limit, ranked.length);

  if (!rotateAfterBeauticianUserId) {
    return ranked.slice(0, cap);
  }

  const currentIndex = ranked.findIndex(
    (candidate) => candidate.userId === rotateAfterBeauticianUserId,
  );

  if (currentIndex === -1) {
    return ranked.slice(0, cap);
  }

  const rotated = [
    ...ranked.slice(currentIndex + 1),
    ...ranked.slice(0, currentIndex + 1),
  ];

  return rotated.slice(0, cap);
}