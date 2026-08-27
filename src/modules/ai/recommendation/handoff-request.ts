/**
 * Phase 4.11: operator-confirmed handoff from a live-validated
 * suggest_human_handoff recommendation. Never auto-escalates.
 */
import "server-only";
import { ConflictError, NotFoundError } from "@/lib/errors";
import {
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { getLead } from "@/modules/leads/queries";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import {
  getLatestAiSalesAnalysis,
  getLatestInboundMessageId,
} from "@/modules/ai/analysis/queries";
import { validateAiSalesAnalysis } from "@/modules/ai/analysis/schema";
import { recommend } from "@/modules/ai/recommendation/policy";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import { getCurrentAiSalesRecommendation } from "@/modules/ai/recommendation/queries";
import { decisionsMatch } from "@/modules/ai/execution/policy";
import { AI_CONTEXT_MESSAGE_LIMIT } from "@/modules/ai/types";
import { escalateToHuman } from "@/modules/ai/handoff";
import type { AiSalesRecommendation, ConversationWithLead } from "@/lib/db/types";
import type { AiSalesRecommendationDecision } from "@/modules/ai/recommendation/schema";

export interface RequestHandoffFromRecommendationInput {
  organizationId: string;
  userId: string;
  conversationId: string;
}

function blocked(): never {
  throw new ConflictError(
    "This recommendation cannot escalate to a human"
  );
}

function isPersistedHandoff(persisted: AiSalesRecommendation): boolean {
  return (
    persisted.recommended_action === "suggest_human_handoff" &&
    persisted.mapped_tool_name === null
  );
}

function isLiveHandoff(fresh: AiSalesRecommendationDecision): boolean {
  return (
    fresh.recommendedAction === "suggest_human_handoff" &&
    fresh.mappedToolName === null
  );
}

async function loadCurrentAnalysisPayload(
  organizationId: string,
  userId: string,
  conversationId: string
) {
  try {
    const row = await getLatestAiSalesAnalysis(
      organizationId,
      userId,
      conversationId
    );
    if (row.status !== "recorded") return null;
    return validateAiSalesAnalysis(row.payload);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export async function requestHandoffFromRecommendation(
  input: RequestHandoffFromRecommendationInput
): Promise<ConversationWithLead> {
  const recommendation = await getCurrentAiSalesRecommendation(
    input.organizationId,
    input.userId,
    input.conversationId
  );

  const latestInboundId = await getLatestInboundMessageId(
    input.organizationId,
    input.conversationId
  );
  if (
    latestInboundId === null ||
    recommendation.inbound_message_id !== latestInboundId
  ) {
    blocked();
  }

  if (recommendation.status !== "recorded") {
    blocked();
  }
  if (recommendation.policy_version !== AI_SALES_RECOMMENDATION_POLICY_V1) {
    blocked();
  }

  const conversation = await getConversation(
    input.organizationId,
    input.userId,
    input.conversationId
  );

  if (
    recommendation.organization_id !== input.organizationId ||
    recommendation.conversation_id !== input.conversationId ||
    recommendation.conversation_id !== conversation.id ||
    recommendation.lead_id !== conversation.lead_id ||
    conversation.organization_id !== input.organizationId
  ) {
    blocked();
  }

  if (conversation.status !== "open") {
    blocked();
  }
  if (conversation.ai_paused_at) {
    blocked();
  }
  if (conversation.requires_human) {
    blocked();
  }

  const lead = await getLead(
    conversation.lead_id,
    input.organizationId,
    input.userId
  );

  if (
    lead.organization_id !== input.organizationId ||
    lead.id !== conversation.lead_id ||
    lead.id !== recommendation.lead_id
  ) {
    blocked();
  }

  const messages = await listRecentConversationMessages(
    input.organizationId,
    input.userId,
    input.conversationId,
    AI_CONTEXT_MESSAGE_LIMIT
  );

  const liveSnapshot = await buildPipelineSnapshot({
    organizationId: input.organizationId,
    leadId: lead.id,
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

  if (
    liveSnapshot.conversationStatus !== "open" ||
    liveSnapshot.aiPaused ||
    liveSnapshot.requiresHuman
  ) {
    blocked();
  }

  if (!isPersistedHandoff(recommendation)) {
    blocked();
  }

  const analysisPayload = await loadCurrentAnalysisPayload(
    input.organizationId,
    input.userId,
    input.conversationId
  );
  const fresh = recommend(liveSnapshot, analysisPayload);
  if (!decisionsMatch(recommendation, fresh) || !isLiveHandoff(fresh)) {
    blocked();
  }

  return escalateToHuman(
    input.organizationId,
    input.userId,
    input.conversationId
  );
}
