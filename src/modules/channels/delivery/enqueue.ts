/**
 * Enqueue a channel delivery job after the outbound message is persisted.
 * Delivery is not authorization and is not an AI execution authority.
 *
 * This module only persists the durable delivery job. It does NOT schedule
 * background processing. The caller's after() callback (ingest, trigger, or
 * the cron drain route) drains both AI and delivery jobs in a single
 * execution, eliminating the nested-after() reliability problem.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { recordStage } from "@/lib/latency-trace";
import { CHANNEL_DELIVERY_MAX_ATTEMPTS, isExternalChannel } from "@/modules/channels/constants";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

export async function enqueueChannelDelivery(input: {
  organizationId: string;
  channelAccountId: string;
  channelIdentityId: string;
  messageId: string;
}): Promise<void> {
  const supabase = createAdminClient();

  const refStart = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refInsert = await (supabase.from("channel_message_refs") as any).insert({
    organization_id: input.organizationId,
    message_id: input.messageId,
    channel_account_id: input.channelAccountId,
    channel_identity_id: input.channelIdentityId,
    direction: "outbound",
    delivery_status: "queued",
  });
  const refDuration = Date.now() - refStart;

  if (refInsert.error && !isUniqueViolation(refInsert.error)) {
    logger.error("Failed to persist outbound channel message ref", {
      organizationId: input.organizationId,
      code: refInsert.error.code ?? "INTERNAL_ERROR",
    });
    throw new Error("Failed to persist outbound channel message ref");
  }

  const jobStart = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("channel_delivery_jobs") as any).insert({
    organization_id: input.organizationId,
    channel_account_id: input.channelAccountId,
    message_id: input.messageId,
    status: "pending",
    max_attempts: CHANNEL_DELIVERY_MAX_ATTEMPTS,
  });
  const jobDuration = Date.now() - jobStart;

  if (error && !isUniqueViolation(error)) {
    logger.error("Failed to enqueue channel delivery job", {
      organizationId: input.organizationId,
      code: error.code ?? "INTERNAL_ERROR",
    });
    throw new Error("Failed to enqueue channel delivery job");
  }

  logger.info("FORENSIC_DELIVERY_ENQUEUE", {
    messageId: input.messageId,
    organizationId: input.organizationId,
    insertRefMs: refDuration,
    insertJobMs: jobDuration,
    totalMs: refDuration + jobDuration,
  });
  recordStage(input.messageId, "delivery_enqueue_ref_inserted");
  recordStage(input.messageId, "delivery_enqueue_job_inserted");
}

export async function enqueueOutboundDeliveryIfExternal(input: {
  organizationId: string;
  conversation: {
    channel: string;
    channel_account_id: string | null;
    channel_identity_id: string | null;
  };
  messageId: string;
}): Promise<void> {
  if (
    !isExternalChannel(input.conversation.channel) ||
    !input.conversation.channel_account_id ||
    !input.conversation.channel_identity_id
  ) {
    return;
  }

  await enqueueChannelDelivery({
    organizationId: input.organizationId,
    channelAccountId: input.conversation.channel_account_id,
    channelIdentityId: input.conversation.channel_identity_id,
    messageId: input.messageId,
  });
}
