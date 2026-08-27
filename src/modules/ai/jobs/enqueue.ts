/**
 * Enqueue a durable AI execution job for a persisted inbound message.
 * Duplicate (organization_id, inbound_message_id) inserts are treated as success.
 * Non-duplicate insert failures are thrown so webhook ingest can return 5xx
 * and the provider can retry. Operator inbound still keeps the customer
 * message because triggerAiAfterInboundMessage catches the error.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { AI_JOB_MAX_ATTEMPTS } from "@/modules/ai/jobs/constants";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

export async function enqueueAiExecutionJob(input: {
  organizationId: string;
  userId: string | null;
  conversationId: string;
  inboundMessageId: string;
  triggerSource?: "operator" | "channel_ingress";
  channelIdentityId?: string | null;
}): Promise<void> {
  const triggerSource = input.triggerSource ?? "operator";
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("ai_execution_jobs") as any).insert({
    organization_id: input.organizationId,
    conversation_id: input.conversationId,
    inbound_message_id: input.inboundMessageId,
    requested_by_user_id: input.userId,
    trigger_source: triggerSource,
    channel_identity_id: input.channelIdentityId ?? null,
    status: "pending",
    max_attempts: AI_JOB_MAX_ATTEMPTS,
  });

  if (!error || isUniqueViolation(error)) {
    return;
  }

  logger.error("Failed to enqueue AI execution job", {
    organizationId: input.organizationId,
    userId: input.userId,
    conversationId: input.conversationId,
    code: error.code ?? "INTERNAL_ERROR",
  });
  throw new Error("Failed to enqueue AI execution job");
}
