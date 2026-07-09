import { MatchingCandidate } from '../services/candidate-finder.service';

export function pickNextCandidateInRotation(
  ranked: MatchingCandidate[],
  rotateAfterBeauticianUserId?: string | null,
): MatchingCandidate | null {
  if (!ranked.length) {
    return null;
  }

  if (!rotateAfterBeauticianUserId) {
    return ranked[0];
  }

  const currentIndex = ranked.findIndex(
    (candidate) => candidate.userId === rotateAfterBeauticianUserId,
  );

  if (currentIndex === -1) {
    return ranked[0];
  }

  return ranked[(currentIndex + 1) % ranked.length];
}