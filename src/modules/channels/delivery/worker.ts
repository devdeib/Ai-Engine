/**
 * Channel delivery worker. Delivers already-persisted outbound messages.
 * Never calls the AI execution pipeline or any AI authorization gate.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWithSupabaseClientOverride } from "@/lib/supabase/client-override";
import { logger } from "@/lib/logger";
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

  const jobs = await claimChannelDeliveryJobs({
    limit,
    organizationId: options.organizationId ?? null,
  });

  for (const job of jobs) {
    await executeClaimedDeliveryJob(job);
  }

  return jobs.length;
}

async function executeClaimedDeliveryJob(
  job: ChannelDeliveryJob
): Promise<void> {
  try {
    const scoped = await loadTrustedDeliveryScope(job);
    if (!scoped.ok) {
      await persistDeliveryOutcome(job, {
        ok: false,
        errorCode: scoped.errorCode,
        retryable: false,
      });
      return;
    }

    const existingRef = await loadOutboundMessageRef(job);
    if (
      existingRef?.delivery_status === "sent" &&
      existingRef.provider_message_id
    ) {
      await markDeliveryCompleted(job);
      return;
    }

    const adapter = getDeliveryAdapter(scoped.account.channel);
    const idempotencyKey = channelDeliveryIdempotencyKey(job.message_id);
    const delivered = await adapter.send({
      organizationId: job.organization_id,
      channelAccountId: job.channel_account_id,
      channelIdentityId: scoped.channelIdentityId,
      messageId: job.message_id,
      destination: scoped.destination,
      body: scoped.body,
      idempotencyKey,
    });
    await persistDeliveryOutcome(job, delivered);
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
): Promise<void> {
  if (result.ok) {
    await updateMessageRef(job, {
      delivery_status: "sent",
      provider_message_id: result.providerMessageId,
      delivered_at: new Date().toISOString(),
      failed_at: null,
      provider_error_code: null,
    });
    await markDeliveryCompleted(job);
    return;
  }

  const canRetry =
    result.retryable && job.attempt_count < job.max_attempts;
  if (canRetry) {
    await markDeliveryRetry(job, result.errorCode);
    await updateMessageRef(job, {
      delivery_status: "queued",
      provider_error_code: result.errorCode,
    });
    return;
  }

  await markDeliveryFailed(job, result.errorCode);
  await updateMessageRef(job, {
    delivery_status: "failed",
    failed_at: new Date().toISOString(),
    provider_error_code: result.errorCode,
  });
}

async function loadTrustedDeliveryScope(
  job: ChannelDeliveryJob
): Promise<
  | {
      ok: true;
      account: ChannelAccount;
      body: string;
      destination: string;
      channelIdentityId: string;
    }
  | { ok: false; errorCode: "TENANT_ACCESS_DENIED" | "CHANNEL_UNSUPPORTED" }
> {
  const supabase = await createClient();

  /* Phase 1: message, account, and ref can load in parallel — they are
     independent lookups scoped by organization_id. */
  const [messageResult, accountResult, refResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("messages") as any)
      .select("id, organization_id, direction, body")
      .eq("id", job.message_id)
      .eq("organization_id", job.organization_id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("channel_accounts") as any)
      .select("id, organization_id, channel, status")
      .eq("id", job.channel_account_id)
      .eq("organization_id", job.organization_id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("channel_message_refs") as any)
      .select("channel_identity_id")
      .eq("organization_id", job.organization_id)
      .eq("message_id", job.message_id)
      .eq("direction", "outbound")
      .maybeSingle(),
  ]);

  const { data: message, error: messageError } = messageResult;
  if (messageError || !message || message.direction !== "outbound") {
    return { ok: false, errorCode: "TENANT_ACCESS_DENIED" };
  }

  const { data: account, error: accountError } = accountResult;
  if (accountError || !account || account.status !== "active") {
    return { ok: false, errorCode: "TENANT_ACCESS_DENIED" };
  }

  if (!isExternalChannel(account.channel as string)) {
    return { ok: false, errorCode: "TENANT_ACCESS_DENIED" };
  }

  try {
    getDeliveryAdapter(account.channel as string);
  } catch (error) {
    if (error instanceof UnsupportedChannelError) {
      return { ok: false, errorCode: "CHANNEL_UNSUPPORTED" };
    }
    throw error;
  }

  const { data: ref, error: refError } = refResult;
  if (refError || !ref?.channel_identity_id) {
    return { ok: false, errorCode: "TENANT_ACCESS_DENIED" };
  }

  /* Phase 2: identity lookup depends on ref.channel_identity_id. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: identity, error: identityError } = await (supabase.from("channel_identities") as any)
    .select("id, external_address")
    .eq("id", ref.channel_identity_id)
    .eq("organization_id", job.organization_id)
    .maybeSingle();

  if (identityError || !identity?.external_address) {
    return { ok: false, errorCode: "TENANT_ACCESS_DENIED" };
  }

  return {
    ok: true,
    account: account as ChannelAccount,
    body: message.body as string,
    destination: identity.external_address as string,
    channelIdentityId: identity.id as string,
  };
}

async function loadOutboundMessageRef(
  job: ChannelDeliveryJob
): Promise<{
  delivery_status: string | null;
  provider_message_id: string | null;
} | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_message_refs") as any)
    .select("delivery_status, provider_message_id")
    .eq("organization_id", job.organization_id)
    .eq("message_id", job.message_id)
    .eq("direction", "outbound")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    delivery_status: (data.delivery_status as string | null) ?? null,
    provider_message_id: (data.provider_message_id as string | null) ?? null,
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