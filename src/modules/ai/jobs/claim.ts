/**
 * Atomically claim due AI execution jobs (FOR UPDATE SKIP LOCKED in SQL).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { AI_JOB_LEASE_SECONDS } from "@/modules/ai/jobs/constants";
import type { AiExecutionJob } from "@/lib/db/types";

export async function claimAiExecutionJobs(input: {
  limit: number;
  organizationId?: string | null;
  leaseSeconds?: number;
}): Promise<AiExecutionJob[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("claim_ai_execution_jobs", {
    p_limit: input.limit,
    p_organization_id: input.organizationId ?? null,
    p_lease_seconds: input.leaseSeconds ?? AI_JOB_LEASE_SECONDS,
  });

  if (error) {
    logger.error("Failed to claim AI execution jobs", {
      organizationId: input.organizationId ?? undefined,
      code: error.code ?? "INTERNAL_ERROR",
    });
    return [];
  }

  return (data ?? []) as AiExecutionJob[];
}
