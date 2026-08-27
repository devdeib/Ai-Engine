/**
 * Durable advisory sales-analysis persistence.
 * Identity and versions are server-owned. Unique on org + inbound message.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { logger } from "@/lib/logger";
import type { AiSalesAnalysis } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import {
  AI_SALES_ANALYSIS_PROMPT_VERSION,
  AI_SALES_ANALYSIS_SCHEMA_VERSION,
} from "@/modules/ai/analysis/constants";
import type { AiSalesAnalysisErrorCode } from "@/modules/ai/analysis/errors";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { pipelineSnapshotSchema } from "@/modules/ai/analysis/schema";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

export interface PersistAiSalesAnalysisInput {
  organizationId: string;
  userId: string | null;
  triggerSource: "operator" | "channel_ingress";
  channelIdentityId: string | null;
  conversationId: string;
  leadId: string;
  inboundMessageId: string;
  inboundMessageCreatedAt: string;
  providerName: string;
  pipeline: AiPipelineSnapshot;
  payload: AiSalesAnalysisPayload | null;
  errorCode: AiSalesAnalysisErrorCode | null;
}

async function loadByInbound(
  organizationId: string,
  inboundMessageId: string
): Promise<AiSalesAnalysis | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_sales_analyses") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("inbound_message_id", inboundMessageId)
    .maybeSingle();
  if (error || !data) return null;
  return data as AiSalesAnalysis;
}

export async function persistAiSalesAnalysis(
  input: PersistAiSalesAnalysisInput
): Promise<AiSalesAnalysis | null> {
  if (input.userId !== null) {
    await requireOrgMembership(input.organizationId, input.userId);
  }

  const snapshot = pipelineSnapshotSchema.safeParse(input.pipeline);
  if (!snapshot.success) {
    logger.error("Pipeline snapshot failed validation before persist", {
      organizationId: input.organizationId,
      userId: input.userId,
    });
    return null;
  }

  const recorded = input.payload !== null;
  const row = {
    organization_id: input.organizationId,
    conversation_id: input.conversationId,
    lead_id: input.leadId,
    inbound_message_id: input.inboundMessageId,
    inbound_message_created_at: input.inboundMessageCreatedAt,
    schema_version: AI_SALES_ANALYSIS_SCHEMA_VERSION,
    prompt_version: AI_SALES_ANALYSIS_PROMPT_VERSION,
    provider_name: input.providerName.slice(0, 64),
    status: recorded ? "recorded" : "failed",
    payload: recorded ? input.payload : {},
    pipeline_snapshot: snapshot.data,
    error_code: recorded ? null : input.errorCode,
    requested_by_user_id: input.userId,
    trigger_source: input.triggerSource,
    channel_identity_id: input.channelIdentityId,
  };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_sales_analyses") as any)
    .insert(row)
    .select()
    .single();

  if (!error && data) {
    return data as AiSalesAnalysis;
  }

  if (!isUniqueViolation(error)) {
    logger.error("Failed to persist AI sales analysis", {
      organizationId: input.organizationId,
      userId: input.userId,
      code: error?.code ?? "INTERNAL_ERROR",
    });
    return null;
  }

  const existing = await loadByInbound(
    input.organizationId,
    input.inboundMessageId
  );
  if (!existing) return null;
  if (existing.status === "recorded") {
    return existing;
  }
  if (!recorded) {
    return existing;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upgraded = await (supabase.from("ai_sales_analyses") as any)
    .update({
      status: "recorded",
      payload: input.payload,
      pipeline_snapshot: snapshot.data,
      error_code: null,
      schema_version: AI_SALES_ANALYSIS_SCHEMA_VERSION,
      prompt_version: AI_SALES_ANALYSIS_PROMPT_VERSION,
      provider_name: input.providerName.slice(0, 64),
    })
    .eq("id", existing.id)
    .eq("organization_id", input.organizationId)
    .eq("status", "failed")
    .select()
    .single();

  if (!upgraded.error && upgraded.data) {
    return upgraded.data as AiSalesAnalysis;
  }

  const replay = await loadByInbound(
    input.organizationId,
    input.inboundMessageId
  );
  return replay;
}
