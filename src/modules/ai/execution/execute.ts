/**
 * Phase 4.8 execution gate. Consumes a persisted 4.7 recommendation and,
 * for suggest_follow_up only, calls existing executeCreateFollowUp.
 * Never blocks the customer reply. Never mutates 4.6/4.7 rows.
 */
import "server-only";
import { NotFoundError, TenantAccessError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { getLead } from "@/modules/leads/queries";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import { recommend } from "@/modules/ai/recommendation/policy";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import { executeCreateFollowUp } from "@/modules/ai/actions/write";
import { AI_CONTEXT_MESSAGE_LIMIT } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { AiSalesRecommendationExecutionError } from "@/modules/ai/execution/errors";
import { buildServerFollowUpInput } from "@/modules/ai/execution/payload";
import {
  decisionsMatch,
  isExecutableFollowUp,
  type RecommendationExecutionSkipReason,
} from "@/modules/ai/execution/policy";
import {
  hasInboundFollowUpAction,
  loadRecommendationByInbound,
} from "@/modules/ai/execution/queries";
import type { AiToolContext } from "@/modules/ai/tools/types";

export type { RecommendationExecutionSkipReason };

export type RecommendationExecutionResult =
  | { outcome: "executed" }
  | { outcome: "skipped"; reason: RecommendationExecutionSkipReason }
  | { outcome: "failed"; code: string };

export interface ExecuteFromRecommendationInput {
  organizationId: string;
  userId: string | null;
  triggerSource: "operator" | "channel_ingress";
  channelIdentityId: string | null;
  conversationId: string;
  leadId: string;
  inboundMessageId: string;
  analysisPayload: AiSalesAnalysisPayload | null;
}

function skipped(
  reason: RecommendationExecutionSkipReason,
  input: ExecuteFromRecommendationInput
): RecommendationExecutionResult {
  logger.info("AI sales recommendation execution skipped", {
    organizationId: input.organizationId,
    userId: input.userId,
    conversationId: input.conversationId,
    reason,
  });
  return { outcome: "skipped", reason };
}

export async function executeFromRecommendation(
  input: ExecuteFromRecommendationInput
): Promise<RecommendationExecutionResult> {
  try {
    if (input.userId !== null) {
      await requireOrgMembership(input.organizationId, input.userId);
    }
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return skipped("tenant_mismatch", input);
    }
    throw error;
  }

  const recommendation = await loadRecommendationByInbound(
    input.organizationId,
    input.inboundMessageId
  );
  if (!recommendation) {
    return skipped("recommendation_unavailable", input);
  }

  if (
    recommendation.organization_id !== input.organizationId ||
    recommendation.conversation_id !== input.conversationId ||
    recommendation.lead_id !== input.leadId ||
    recommendation.inbound_message_id !== input.inboundMessageId
  ) {
    return skipped("identity_mismatch", input);
  }

  if (recommendation.status !== "recorded") {
    return skipped("failed_recommendation", input);
  }

  if (recommendation.policy_version !== AI_SALES_RECOMMENDATION_POLICY_V1) {
    return skipped("unsupported_policy", input);
  }

  let conversation;
  try {
    conversation = await getConversation(
      input.organizationId,
      input.userId,
      input.conversationId
    );
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof TenantAccessError) {
      return skipped("tenant_mismatch", input);
    }
    throw error;
  }

  if (
    conversation.organization_id !== input.organizationId ||
    conversation.id !== input.conversationId ||
    conversation.lead_id !== input.leadId
  ) {
    return skipped("identity_mismatch", input);
  }

  if (conversation.status !== "open") {
    return skipped("closed", input);
  }
  if (conversation.ai_paused_at) {
    return skipped("conversation_paused", input);
  }
  if (conversation.requires_human) {
    return skipped("requires_human", input);
  }

  let lead;
  try {
    lead = await getLead(input.leadId, input.organizationId, input.userId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof TenantAccessError) {
      return skipped("tenant_mismatch", input);
    }
    throw error;
  }

  if (lead.organization_id !== input.organizationId || lead.id !== input.leadId) {
    return skipped("identity_mismatch", input);
  }

  const messages = await listRecentConversationMessages(
    input.organizationId,
    input.userId,
    input.conversationId,
    AI_CONTEXT_MESSAGE_LIMIT
  );

  const liveSnapshot = await buildPipelineSnapshot({
    organizationId: input.organizationId,
    leadId: input.leadId,
    conversationId: input.conversationId,
    leadStatus: lead.status,
    conversationStatus: conversation.status,
    requiresHuman: conversation.requires_human,
    aiPausedAt: conversation.ai_paused_at,
    contactEmailPresent: Boolean(lead.email && lead.email.trim()),
    contactPhonePresent: Boolean(lead.phone && lead.phone.trim()),
    messages: messages.map((message) => ({
      direction: message.direction,
      createdAt: message.created_at,
    })),
  });

  if (liveSnapshot.hasPendingFollowUp) {
    return skipped("already_has_pending_follow_up", input);
  }

  const fresh = recommend(liveSnapshot, input.analysisPayload);
  if (!decisionsMatch(recommendation, fresh)) {
    return skipped("policy_mismatch", input);
  }

  if (!isExecutableFollowUp(recommendation, fresh)) {
    return skipped("not_executable", input);
  }

  if (
    await hasInboundFollowUpAction(input.organizationId, input.inboundMessageId)
  ) {
    return skipped("already_has_tool_action", input);
  }

  const payload = buildServerFollowUpInput(
    recommendation.inbound_message_created_at
  );
  if (!payload) {
    logger.error("AI sales recommendation execution failed", {
      organizationId: input.organizationId,
      userId: input.userId,
      conversationId: input.conversationId,
      code: "AI_RECOMMENDATION_EXECUTION_FAILED",
    });
    return { outcome: "failed", code: "AI_RECOMMENDATION_EXECUTION_FAILED" };
  }

  const toolContext: AiToolContext = {
    organizationId: input.organizationId,
    userId: input.userId,
    triggerSource: input.triggerSource,
    channelIdentityId: input.channelIdentityId,
    conversationId: input.conversationId,
    leadId: input.leadId,
    inboundMessageId: input.inboundMessageId,
  };

  try {
    await executeCreateFollowUp(toolContext, payload);
  } catch (error) {
    const code =
      error instanceof AiSalesRecommendationExecutionError
        ? error.code
        : "AI_RECOMMENDATION_EXECUTION_FAILED";
    logger.error("AI sales recommendation execution failed", {
      organizationId: input.organizationId,
      userId: input.userId,
      conversationId: input.conversationId,
      code,
    });
    return { outcome: "failed", code };
  }

  logger.info("AI sales recommendation execution finished", {
    organizationId: input.organizationId,
    userId: input.userId,
    conversationId: input.conversationId,
    outcome: "executed",
    recommendedAction: "suggest_follow_up",
    policyVersion: AI_SALES_RECOMMENDATION_POLICY_V1,
  });
  return { outcome: "executed" };
}
