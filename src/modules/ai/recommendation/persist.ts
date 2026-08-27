/**
 * Durable AI sales recommendation persistence.
 * Identity and policy version are server-owned. Unique on org + inbound.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { logger } from "@/lib/logger";
import type { AiSalesRecommendation } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { pipelineSnapshotSchema } from "@/modules/ai/analysis/schema";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import type { AiSalesRecommendationErrorCode } from "@/modules/ai/recommendation/errors";
import {
  citedAnalysisActionSchema,
  recommendationReasonCodesSchema,
  type AiSalesAnalysisNextBestAction,
  type AiSalesRecommendationDecision,
} from "@/modules/ai/recommendation/schema";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

export interface PersistAiSalesRecommendationInput {
  organizationId: string;
  userId: string | null;
  triggerSource: "operator" | "channel_ingress";
  channelIdentityId: string | null;
  conversationId: string;
  leadId: string;
  inboundMessageId: string;
  inboundMessageCreatedAt: string;
  analysisId: string | null;
  analysisStatus: "recorded" | "failed" | null;
  analysisPayload: AiSalesAnalysisPayload | null;
  pipeline: AiPipelineSnapshot;
  decision: AiSalesRecommendationDecision;
  errorCode: AiSalesRecommendationErrorCode | null;
}

async function loadByInbound(
  organizationId: string,
  inboundMessageId: string
): Promise<AiSalesRecommendation | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_sales_recommendations") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("inbound_message_id", inboundMessageId)
    .maybeSingle();
  if (error || !data) return null;
  return data as AiSalesRecommendation;
}

function citedAction(
  analysisStatus: "recorded" | "failed" | null,
  payload: AiSalesAnalysisPayload | null
): AiSalesAnalysisNextBestAction | null {
  if (analysisStatus !== "recorded" || !payload) return null;
  const parsed = citedAnalysisActionSchema.safeParse(payload.nextBestAction);
  return parsed.success ? parsed.data : null;
}

export async function persistAiSalesRecommendation(
  input: PersistAiSalesRecommendationInput
): Promise<AiSalesRecommendation | null> {
  if (input.userId !== null) {
    await requireOrgMembership(input.organizationId, input.userId);
  }

  const snapshot = pipelineSnapshotSchema.safeParse(input.pipeline);
  if (!snapshot.success) {
    logger.error("Pipeline snapshot failed validation before recommendation persist", {
      organizationId: input.organizationId,
      userId: input.userId,
    });
    return null;
  }

  const reasons = recommendationReasonCodesSchema.safeParse(
    input.decision.reasonCodes
  );
  if (!reasons.success) {
    logger.error("Recommendation reason codes failed validation before persist", {
      organizationId: input.organizationId,
      userId: input.userId,
    });
    return null;
  }

  const recorded = input.errorCode === null;
  const row = {
    organization_id: input.organizationId,
    conversation_id: input.conversationId,
    lead_id: input.leadId,
    inbound_message_id: input.inboundMessageId,
    inbound_message_created_at: input.inboundMessageCreatedAt,
    analysis_id: input.analysisId,
    policy_version: AI_SALES_RECOMMENDATION_POLICY_V1,
    status: recorded ? "recorded" : "failed",
    recommended_action: input.decision.recommendedAction,
    cited_analysis_action: citedAction(input.analysisStatus, input.analysisPayload),
    requires_human_approval: input.decision.requiresHumanApproval,
    mapped_tool_name: input.decision.mappedToolName,
    reason_codes: reasons.data,
    pipeline_snapshot: snapshot.data,
    error_code: recorded ? null : input.errorCode,
    requested_by_user_id: input.userId,
    trigger_source: input.triggerSource,
    channel_identity_id: input.channelIdentityId,
  };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_sales_recommendations") as any)
    .insert(row)
    .select()
    .single();

  if (!error && data) {
    return data as AiSalesRecommendation;
  }

  if (!isUniqueViolation(error)) {
    logger.error("Failed to persist AI sales recommendation", {
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
  const upgraded = await (supabase.from("ai_sales_recommendations") as any)
    .update({
      status: "recorded",
      recommended_action: input.decision.recommendedAction,
      cited_analysis_action: citedAction(input.analysisStatus, input.analysisPayload),
      requires_human_approval: input.decision.requiresHumanApproval,
      mapped_tool_name: input.decision.mappedToolName,
      reason_codes: reasons.data,
      pipeline_snapshot: snapshot.data,
      analysis_id: input.analysisId,
      policy_version: AI_SALES_RECOMMENDATION_POLICY_V1,
      error_code: null,
    })
    .eq("id", existing.id)
    .eq("organization_id", input.organizationId)
    .eq("status", "failed")
    .select()
    .single();

  if (!upgraded.error && upgraded.data) {
    return upgraded.data as AiSalesRecommendation;
  }

  const replay = await loadByInbound(
    input.organizationId,
    input.inboundMessageId
  );
  return replay;
}
