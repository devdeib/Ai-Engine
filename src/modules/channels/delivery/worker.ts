/**
 * Channel delivery worker. Delivers already-persisted outbound messages.
 * Never calls the AI execution pipeline or any AI authorization gate.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWithSupabaseClientOverride } from "@/lib/supabase/client-override";
import { logger } from "@/lib/logger";
import { recordStage } from "@/lib/latency-trace";
import {
  CHANNEL_DELIVERY_CLAIM_LIMIT,
  CHANNEL_DELIVERY_CRON_CLAIM_LIMIT,
  channelDeliveryIdempotencyKey,
  channelDeliveryRetryDelaySeconds,
  isExternalChannel,
} from "@/modules/channels/constants";
import {
  getDeliveryAdapter,
  UnsupportedChannelError,
} from "@/modules/channels/adapters/registry";
import type { ChannelDeliverySendResult } from "@/modules/channels/adapters/types";
import { claimChannelDeliveryJobs } from "@/modules/channels/delivery/claim";
import type { ChannelAccount, ChannelDeliveryJob } from "@/lib/db/types";

export interface ProcessDueChannelDeliveryJobsOptions {
  organizationId?: string;
  limit?: number;
  useAdminClient?: boolean;
}

export async function processDueChannelDeliveryJobs(
  options: ProcessDueChannelDeliveryJobsOptions = {}
): Promise<number> {
  const run = () => drainDueChannelDeliveryJobs(options);
  if (options.useAdminClient) {
    return runWithSupabaseClientOverride(createAdminClient(), run);
  }
  return run();
}

async function drainDueChannelDeliveryJobs(
  options: ProcessDueChannelDeliveryJobsOptions
): Promise<number> {
  const limit =
    options.limit ??
    (options.useAdminClient
      ? CHANNEL_DELIVERY_CRON_CLAIM_LIMIT
      : CHANNEL_DELIVERY_CLAIM_LIMIT);

  const claimStart = Date.now();
  const jobs = await claimChannelDeliveryJobs({
    limit,
    organizationId: options.organizationId ?? null,
  });
  const claimDuration = Date.now() - claimStart;

  if (jobs.length > 0) {
    logger.info("FORENSIC_DELIVERY_CLAIM", {
      organizationId: options.organizationId ?? "all",
      claimMs: claimDuration,
      jobsClaimed: jobs.length,
    });
  }

  for (const job of jobs) {
    await executeClaimedDeliveryJob(job);
  }

  return jobs.length;
}

async function executeClaimedDeliveryJob(
  job: ChannelDeliveryJob
): Promise<void> {
  /* Use the linked inbound message id from the AI job for trace correlation.
     Delivery jobs don't store it directly, so we use the message_id to look up
     the in_reply_to_message_id after scope loading. For now, trace by message_id
     and finalize the trace at the end via any available correlation. */
  try {
    recordStage(job.message_id, "delivery_job_claimed");
    const scopeStart = Date.now();
    const scoped = await loadTrustedDeliveryScope(job);
    const scopeDuration = Date.now() - scopeStart;
    if (!scoped.ok) {
      logger.info("FORENSIC_DELIVERY_SCOPE", {
        messageId: job.message_id,
        organizationId: job.organization_id,
        ok: false,
        errorCode: scoped.errorCode,
        phase1Parallel: true,
        phase1Ms: scoped.forensics.phase1Ms,
        messageMs: scoped.forensics.messageMs,
        accountMs: scoped.forensics.accountMs,
        refMs: scoped.forensics.refMs,
        identityMs: scoped.forensics.identityMs,
        totalMs:
          scoped.forensics.phase1Ms + scoped.forensics.identityMs,
      });
      await persistDeliveryOutcome(job, {
        ok: false,
        errorCode: scoped.errorCode,
        retryable: false,
      });
      return;
    }
    recordStage(job.message_id, "delivery_scope_loaded");

    /* Idempotency fields were loaded with the trusted outbound ref in scope —
       reuse them instead of a second channel_message_refs round trip. */
    const idempotencyStart = Date.now();
    const existingRef = {
      delivery_status: scoped.deliveryStatus,
      provider_message_id: scoped.providerMessageId,
    };
    const idempotencyDuration = Date.now() - idempotencyStart;
    if (
      existingRef.delivery_status === "sent" &&
      existingRef.provider_message_id
    ) {
      await markDeliveryCompleted(job);
      return;
    }

    const adapter = getDeliveryAdapter(scoped.account.channel);
    const idempotencyKey = channelDeliveryIdempotencyKey(job.message_id);
    recordStage(job.message_id, "outbound_api_start");
    const apiStart = Date.now();
    const delivered = await adapter.send({
      organizationId: job.organization_id,
      channelAccountId: job.channel_account_id,
      channelIdentityId: scoped.channelIdentityId,
      messageId: job.message_id,
      destination: scoped.destination,
      body: scoped.body,
      idempotencyKey,
    });
    const apiDuration = Date.now() - apiStart;
    recordStage(job.message_id, "outbound_api_done");

    const outcomeStart = Date.now();
    const outcomeParts = await persistDeliveryOutcome(job, delivered);
    const outcomeDuration = Date.now() - outcomeStart;

    logger.info("FORENSIC_DELIVERY_DRAIN", {
      messageId: job.message_id,
      organizationId: job.organization_id,
      channel: scoped.account.channel,
      scopeLoadMs: scopeDuration,
      scopePhase1Ms: scoped.forensics.phase1Ms,
      scopeMessageMs: scoped.forensics.messageMs,
      scopeAccountMs: scoped.forensics.accountMs,
      scopeRefMs: scoped.forensics.refMs,
      scopeIdentityMs: scoped.forensics.identityMs,
      idempotencyCheckMs: idempotencyDuration,
      idempotencyReusedScopeRef: true,
      providerApiMs: apiDuration,
      outcomePersistMs: outcomeDuration,
      outcomeUpdateRefMs: outcomeParts.updateRefMs,
      outcomeUpdateJobMs: outcomeParts.updateJobMs,
      outcomePath: outcomeParts.path,
      totalMs: scopeDuration + idempotencyDuration + apiDuration + outcomeDuration,
    });
  } catch (error) {
    if (error instanceof UnsupportedChannelError) {
      await persistDeliveryOutcome(job, {
        ok: false,
        errorCode: "CHANNEL_UNSUPPORTED",
        retryable: false,
      });
      return;
    }

    const code = "CHANNEL_DELIVERY_FAILED";
    logger.error("Channel delivery job failed", {
      organizationId: job.organization_id,
      code,
    });
    await persistDeliveryOutcome(job, {
      ok: false,
      errorCode: code,
      retryable: true,
    });
  }
}

async function persistDeliveryOutcome(
  job: ChannelDeliveryJob,
  result: ChannelDeliverySendResult
): Promise<{
  path: "success" | "retry" | "failed";
  updateRefMs: number;
  updateJobMs: number;
}> {
  if (result.ok) {
    const refStart = Date.now();
    await updateMessageRef(job, {
      delivery_status: "sent",
      provider_message_id: result.providerMessageId,
      delivered_at: new Date().toISOString(),
      failed_at: null,
      provider_error_code: null,
    });
    const updateRefMs = Date.now() - refStart;

    const jobStart = Date.now();
    await markDeliveryCompleted(job);
    const updateJobMs = Date.now() - jobStart;

    return { path: "success", updateRefMs, updateJobMs };
  }

  const canRetry =
    result.retryable && job.attempt_count < job.max_attempts;
  if (canRetry) {
    const jobStart = Date.now();
    await markDeliveryRetry(job, result.errorCode);
    const updateJobMs = Date.now() - jobStart;

    const refStart = Date.now();
    await updateMessageRef(job, {
      delivery_status: "queued",
      provider_error_code: result.errorCode,
    });
    const updateRefMs = Date.now() - refStart;

    return { path: "retry", updateRefMs, updateJobMs };
  }

  const jobStart = Date.now();
  await markDeliveryFailed(job, result.errorCode);
  const updateJobMs = Date.now() - jobStart;

  const refStart = Date.now();
  await updateMessageRef(job, {
    delivery_status: "failed",
    failed_at: new Date().toISOString(),
    provider_error_code: result.errorCode,
  });
  const updateRefMs = Date.now() - refStart;

  return { path: "failed", updateRefMs, updateJobMs };
}

type DeliveryScopeForensics = {
  phase1Ms: number;
  messageMs: number;
  accountMs: number;
  refMs: number;
  identityMs: number;
};

async function loadTrustedDeliveryScope(
  job: ChannelDeliveryJob
): Promise<
  | {
      ok: true;
      account: ChannelAccount;
      body: string;
      destination: string;
      channelIdentityId: string;
      deliveryStatus: string | null;
      providerMessageId: string | null;
      forensics: DeliveryScopeForensics;
    }
  | {
      ok: false;
      errorCode: "TENANT_ACCESS_DENIED" | "CHANNEL_UNSUPPORTED";
      forensics: DeliveryScopeForensics;
    }
> {
  const supabase = await createClient();
  let messageMs = 0;
  let accountMs = 0;
  let refMs = 0;
  let identityMs = 0;

  /* Phase 1: message, account, and ref can load in parallel — they are
     independent lookups scoped by organization_id. */
  const phase1Start = Date.now();
  const [messageResult, accountResult, refResult] = await Promise.all([
    (async () => {
      const start = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase.from("messages") as any)
        .select("id, organization_id, direction, body")
        .eq("id", job.message_id)
        .eq("organization_id", job.organization_id)
        .maybeSingle();
      messageMs = Date.now() - start;
      return result;
    })(),
    (async () => {
      const start = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase.from("channel_accounts") as any)
        .select("id, organization_id, channel, status")
        .eq("id", job.channel_account_id)
        .eq("organization_id", job.organization_id)
        .maybeSingle();
      accountMs = Date.now() - start;
      return result;
    })(),
    (async () => {
      const start = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase.from("channel_message_refs") as any)
        .select("channel_identity_id, delivery_status, provider_message_id")
        .eq("organization_id", job.organization_id)
        .eq("message_id", job.message_id)
        .eq("direction", "outbound")
        .maybeSingle();
      refMs = Date.now() - start;
      return result;
    })(),
  ]);
  const phase1Ms = Date.now() - phase1Start;

  const forensicsBase = (): DeliveryScopeForensics => ({
    phase1Ms,
    messageMs,
    accountMs,
    refMs,
    identityMs,
  });

  const { data: message, error: messageError } = messageResult;
  if (messageError || !message || message.direction !== "outbound") {
    return {
      ok: false,
      errorCode: "TENANT_ACCESS_DENIED",
      forensics: forensicsBase(),
    };
  }

  const { data: account, error: accountError } = accountResult;
  if (accountError || !account || account.status !== "active") {
    return {
      ok: false,
      errorCode: "TENANT_ACCESS_DENIED",
      forensics: forensicsBase(),
    };
  }

  if (!isExternalChannel(account.channel as string)) {
    return {
      ok: false,
      errorCode: "TENANT_ACCESS_DENIED",
      forensics: forensicsBase(),
    };
  }

  try {
    getDeliveryAdapter(account.channel as string);
  } catch (error) {
    if (error instanceof UnsupportedChannelError) {
      return {
        ok: false,
        errorCode: "CHANNEL_UNSUPPORTED",
        forensics: forensicsBase(),
      };
    }
    throw error;
  }

  const { data: ref, error: refError } = refResult;
  if (refError || !ref?.channel_identity_id) {
    return {
      ok: false,
      errorCode: "TENANT_ACCESS_DENIED",
      forensics: forensicsBase(),
    };
  }

  /* Phase 2: identity lookup depends on ref.channel_identity_id. */
  const identityStart = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: identity, error: identityError } = await (supabase.from("channel_identities") as any)
    .select("id, external_address")
    .eq("id", ref.channel_identity_id)
    .eq("organization_id", job.organization_id)
    .maybeSingle();
  identityMs = Date.now() - identityStart;

  if (identityError || !identity?.external_address) {
    return {
      ok: false,
      errorCode: "TENANT_ACCESS_DENIED",
      forensics: forensicsBase(),
    };
  }

  logger.info("FORENSIC_DELIVERY_SCOPE", {
    messageId: job.message_id,
    organizationId: job.organization_id,
    ok: true,
    phase1Parallel: true,
    phase1Ms,
    messageMs,
    accountMs,
    refMs,
    identityMs,
    totalMs: phase1Ms + identityMs,
  });

  return {
    ok: true,
    account: account as ChannelAccount,
    body: message.body as string,
    destination: identity.external_address as string,
    channelIdentityId: identity.id as string,
    deliveryStatus:
      typeof ref.delivery_status === "string" ? ref.delivery_status : null,
    providerMessageId:
      typeof ref.provider_message_id === "string"
        ? ref.provider_message_id
        : null,
    forensics: forensicsBase(),
  };
}

async function markDeliveryCompleted(job: ChannelDeliveryJob): Promise<void> {
  await updateDeliveryJob(job, {
    status: "completed",
    locked_at: null,
    last_error_code: null,
    completed_at: new Date().toISOString(),
  });
}

async function markDeliveryRetry(
  job: ChannelDeliveryJob,
  code: string
): Promise<void> {
  const delayMs = channelDeliveryRetryDelaySeconds(job.attempt_count) * 1000;
  await updateDeliveryJob(job, {
    status: "pending",
    locked_at: null,
    last_error_code: code,
    available_at: new Date(Date.now() + delayMs).toISOString(),
    completed_at: null,
  });
}

async function markDeliveryFailed(
  job: ChannelDeliveryJob,
  code: string
): Promise<void> {
  await updateDeliveryJob(job, {
    status: "failed",
    locked_at: null,
    last_error_code: code,
    completed_at: new Date().toISOString(),
  });
}

async function updateDeliveryJob(
  job: ChannelDeliveryJob,
  patch: {
    status: ChannelDeliveryJob["status"];
    locked_at: string | null;
    last_error_code: string | null;
    completed_at?: string | null;
    available_at?: string;
  }
): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("channel_delivery_jobs") as any)
    .update(patch)
    .eq("id", job.id)
    .eq("organization_id", job.organization_id);

  if (error) {
    logger.error("Failed to update channel delivery job", {
      organizationId: job.organization_id,
      code: error.code ?? "INTERNAL_ERROR",
    });
  }
}

async function updateMessageRef(
  job: ChannelDeliveryJob,
  patch: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("channel_message_refs") as any)
    .update(patch)
    .eq("organization_id", job.organization_id)
    .eq("message_id", job.message_id);

  if (error) {
    logger.error("Failed to update channel message ref", {
      organizationId: job.organization_id,
      code: error.code ?? "INTERNAL_ERROR",
    });
  }
}