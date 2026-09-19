/**
 * AI execution worker. Claims jobs and invokes Phase 4.1.
 * This module must not build prompts, call providers, or insert AI messages.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWithSupabaseClientOverride } from "@/lib/supabase/client-override";
import { ConflictError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { processConversationMessage } from "@/modules/ai/service";
import {
  channelIngressPrincipal,
  operatorPrincipal,
  type AiExecutionPrincipal,
} from "@/modules/ai/principal";
import {
  AI_JOB_CLAIM_LIMIT,
  AI_JOB_CRON_CLAIM_LIMIT,
  retryDelaySeconds,
} from "@/modules/ai/jobs/constants";
import { claimAiExecutionJobs } from "@/modules/ai/jobs/claim";
import { aiJobErrorCode, isRetryableAiJobError } from "@/modules/ai/jobs/retry";
import type { AiExecutionJob } from "@/lib/db/types";

export interface ProcessDueAiJobsOptions {
  organizationId?: string;
  limit?: number;
  useAdminClient?: boolean;
}

export async function processDueAiJobs(
  options: ProcessDueAiJobsOptions = {}
): Promise<number> {
  const run = () => drainDueAiJobs(options);
  if (options.useAdminClient) {
    return runWithSupabaseClientOverride(createAdminClient(), run);
  }
  return run();
}

async function drainDueAiJobs(
  options: ProcessDueAiJobsOptions
): Promise<number> {
  const limit =
    options.limit ??
    (options.useAdminClient ? AI_JOB_CRON_CLAIM_LIMIT : AI_JOB_CLAIM_LIMIT);

  const jobs = await claimAiExecutionJobs({
    limit,
    organizationId: options.organizationId ?? null,
  });

  for (const job of jobs) {
    await executeClaimedJob(job);
  }

  return jobs.length;
}

async function executeClaimedJob(job: AiExecutionJob): Promise<void> {
  try {
    const scoped = await loadTrustedJobScope(job);
    if (!scoped) {
      await markJobFailed(job, "TENANT_ACCESS_DENIED");
      return;
    }

    const principal = principalFromJob(job);
    if (!principal) {
      await markJobFailed(job, "TENANT_ACCESS_DENIED");
      return;
    }

    await processConversationMessage(
      job.organization_id,
      job.conversation_id,
      principal
    );
    await markJobCompleted(job);
  } catch (error) {
    if (error instanceof ConflictError) {
      await markJobCompleted(job);
      return;
    }

    const code = aiJobErrorCode(error);
    logger.error("AI execution job failed", {
      organizationId: job.organization_id,
      userId: job.requested_by_user_id,
      conversationId: job.conversation_id,
      code,
    });

    if (
      isRetryableAiJobError(error) &&
      job.attempt_count < job.max_attempts
    ) {
      await markJobRetry(job, code);
      return;
    }

    await markJobFailed(job, code);
  }
}

async function loadTrustedJobScope(job: AiExecutionJob): Promise<boolean> {
  const supabase = await createClient();

  /* Both lookups are independent and scoped by organization_id — run in parallel. */
  const [conversationResult, inboundResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("conversations") as any)
      .select("id, organization_id")
      .eq("id", job.conversation_id)
      .eq("organization_id", job.organization_id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("messages") as any)
      .select("id, organization_id, conversation_id, direction, author_type")
      .eq("id", job.inbound_message_id)
      .eq("organization_id", job.organization_id)
      .eq("conversation_id", job.conversation_id)
      .maybeSingle(),
  ]);

  const { data: conversation, error: conversationError } = conversationResult;
  if (conversationError || !conversation) {
    return false;
  }

  const { data: inbound, error: inboundError } = inboundResult;
  if (inboundError || !inbound) {
    return false;
  }

  if (inbound.direction !== "inbound") {
    return false;
  }

  if (job.trigger_source === "channel_ingress") {
    return inbound.author_type === "customer";
  }

  return inbound.author_type === "human";
}

function principalFromJob(job: AiExecutionJob): AiExecutionPrincipal | null {
  if (job.trigger_source === "channel_ingress") {
    if (job.requested_by_user_id !== null || !job.channel_identity_id) {
      return null;
    }
    return channelIngressPrincipal();
  }

  if (!job.requested_by_user_id || job.channel_identity_id) {
    return null;
  }
  return operatorPrincipal(job.requested_by_user_id);
}

async function markJobCompleted(job: AiExecutionJob): Promise<void> {
  await updateJob(job, {
    status: "completed",
    locked_at: null,
    last_error_code: null,
    completed_at: new Date().toISOString(),
  });
}

async function markJobRetry(job: AiExecutionJob, code: string): Promise<void> {
  const delayMs = retryDelaySeconds(job.attempt_count) * 1000;
  await updateJob(job, {
    status: "pending",
    locked_at: null,
    last_error_code: code,
    available_at: new Date(Date.now() + delayMs).toISOString(),
    completed_at: null,
  });
}

async function markJobFailed(job: AiExecutionJob, code: string): Promise<void> {
  await updateJob(job, {
    status: "failed",
    locked_at: null,
    last_error_code: code,
    completed_at: new Date().toISOString(),
  });
}

async function updateJob(
  job: AiExecutionJob,
  patch: {
    status: AiExecutionJob["status"];
    locked_at: string | null;
    last_error_code: string | null;
    completed_at?: string | null;
    available_at?: string;
  }
): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("ai_execution_jobs") as any)
    .update(patch)
    .eq("id", job.id)
    .eq("organization_id", job.organization_id);

  if (error) {
    logger.error("Failed to update AI execution job", {
      organizationId: job.organization_id,
      code: error.code ?? "INTERNAL_ERROR",
    });
  }
}
