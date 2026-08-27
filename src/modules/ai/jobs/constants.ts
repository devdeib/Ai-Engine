export const AI_JOB_MAX_ATTEMPTS = 3;
export const AI_JOB_LEASE_SECONDS = 90;
export const AI_JOB_CLAIM_LIMIT = 5;
export const AI_JOB_CRON_CLAIM_LIMIT = 1;

export function retryDelaySeconds(attemptCount: number): number {
  const capped = Math.min(Math.max(attemptCount, 1), 6);
  return 5 * capped;
}
