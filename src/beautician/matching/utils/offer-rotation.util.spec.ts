import { pickNextCandidateInRotation } from './offer-rotation.util';

const candidate = (userId: string) => ({
  userId,
  profileId: `profile-${userId}`,
  distanceKm: 1,
  commissionRateOverride: null,
  score: 1,
  scoreSnapshot: {},
});

describe('pickNextCandidateInRotation', () => {
  const ranked = [candidate('b'), candidate('c')];

  it('returns the top-ranked candidate when no prior offer exists', () => {
    expect(pickNextCandidateInRotation(ranked, null)).toEqual(ranked[0]);
    expect(pickNextCandidateInRotation(ranked, undefined)).toEqual(ranked[0]);
  });

  it('rotates from B to C after B was last offered', () => {
    expect(pickNextCandidateInRotation(ranked, 'b')).toEqual(ranked[1]);
  });

  it('cycles from C back to B after C was last offered', () => {
    expect(pickNextCandidateInRotation(ranked, 'c')).toEqual(ranked[0]);
  });

  it('starts from the top when the last offered beautician is no longer eligible', () => {
    expect(pickNextCandidateInRotation([candidate('c')], 'b')).toEqual(
      candidate('c'),
    );
  });

  it('returns null when no candidates are eligible', () => {
    expect(pickNextCandidateInRotation([], 'b')).toBeNull();
  });
});