export const DISPATCH_PROBATION_QUEUE = 'beautician-dispatch-probation';

export const DISPATCH_PROBATION_JOB = 'lift-dispatch-suspension';

export function dispatchProbationJobId(profileId: string): string {
  return `dispatch-probation:${profileId}`;
}

export type DispatchProbationJobData = {
  profileId: string;
  userId: string;
  /** ISO timestamp the suspension was scheduled to end; used to ignore stale jobs. */
  suspendedUntil: string;
};
