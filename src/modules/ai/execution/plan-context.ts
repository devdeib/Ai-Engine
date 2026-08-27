/**
 * Loads live server-owned inputs for the Phase 4.9 planner.
 * Read-only. Never executes recommendations or writes ledger/CRM rows.
 */
import "server-only";
import { NotFoundError, TenantAccessError } from "@/lib/errors";
import { getConversation, listRecentConversationMessages } from "@/modules/conversations/queries";
import { getLead } from "@/modules/leads/queries";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import {
  getLatestAiSalesAnalysis,
  getLatestInboundMessageId,
} from "@/modules/ai/analysis/queries";
import { validateAiSalesAnalysis } from "@/modules/ai/analysis/schema";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import { AI_CONTEXT_MESSAGE_LIMIT } from "@/modules/ai/types";
import type { AiSalesRecommendation } from "@/lib/db/types";
import { listConversationToolActions } from "@/modules/ai/execution/queries";
import {
  planFromRecommendation,
  type PlanConversationState,
  type PlanLeadState,
  type PlanLedgerSource,
  type PublicExecutionPlan,
} from "@/modules/ai/execution/plan";
import type { RecommendationExecutionSkipReason } from "@/modules/ai/execution/policy";
import { toPublicAiSalesRecommendation } from "@/modules/ai/recommendation/map";
import type { PublicAiSalesRecommendation } from "@/modules/ai/recommendation/map";

export interface RecommendationPlanContext {
  organizationId: string;
  conversationId: string;
  leadId: string | null;
  latestInboundId: string | null;
  conversation: PlanConversationState | null;
  lead: PlanLeadState | null;
  liveSnapshot: AiPipelineSnapshot | null;
  analysisPayload: AiSalesAnalysisPayload | null;
  actionsByInbound: Map<string, PlanLedgerSource[]>;
  contextSkipReason: RecommendationExecutionSkipReason | null;
}

function groupActionsByInbound(
  actions: PlanLedgerSource[]
): Map<string, PlanLedgerSource[]> {
  const grouped = new Map<string, PlanLedgerSource[]>();
  for (const action of actions) {
    const existing = grouped.get(action.inbound_message_id) ?? [];
    existing.push(action);
    grouped.set(action.inbound_message_id, existing);
  }
  return grouped;
}

async function loadCurrentAnalysisPayload(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<AiSalesAnalysisPayload | null> {
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

export async function loadRecommendationPlanContext(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<RecommendationPlanContext> {
  const empty: RecommendationPlanContext = {
    organizationId,
    conversationId,
    leadId: null,
    latestInboundId: null,
    conversation: null,
    lead: null,
    liveSnapshot: null,
    analysisPayload: null,
    actionsByInbound: new Map(),
    contextSkipReason: null,
  };

  let conversation;
  try {
    conversation = await getConversation(organizationId, userId, conversationId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof TenantAccessError) {
      return { ...empty, contextSkipReason: "tenant_mismatch" };
    }
    throw error;
  }

  const conversationState: PlanConversationState = {
    organizationId: conversation.organization_id,
    conversationId: conversation.id,
    leadId: conversation.lead_id,
    status: conversation.status,
    requiresHuman: conversation.requires_human,
    aiPausedAt: conversation.ai_paused_at,
  };

  let lead;
  try {
    lead = await getLead(conversation.lead_id, organizationId, userId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof TenantAccessError) {
      return {
        ...empty,
        conversation: conversationState,
        leadId: conversation.lead_id,
        contextSkipReason: "tenant_mismatch",
      };
    }
    throw error;
  }

  const messages = await listRecentConversationMessages(
    organizationId,
    userId,
    conversationId,
    AI_CONTEXT_MESSAGE_LIMIT
  );

  const [liveSnapshot, latestInboundId, analysisPayload, actions] =
    await Promise.all([
      buildPipelineSnapshot({
        organizationId,
        leadId: lead.id,
        conversationId,
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
      }),
      getLatestInboundMessageId(organizationId, conversationId),
      loadCurrentAnalysisPayload(organizationId, userId, conversationId),
      listConversationToolActions(organizationId, conversationId),
    ]);

  return {
    organizationId,
    conversationId,
    leadId: lead.id,
    latestInboundId,
    conversation: conversationState,
    lead: {
      organizationId: lead.organization_id,
      leadId: lead.id,
    },
    liveSnapshot,
    analysisPayload,
    actionsByInbound: groupActionsByInbound(actions),
    contextSkipReason: null,
  };
}

export function planForRecommendation(
  row: AiSalesRecommendation,
  context: RecommendationPlanContext
): PublicExecutionPlan {
  return planFromRecommendation({
    recommendation: row,
    organizationId: context.organizationId,
    conversationId: context.conversationId,
    leadId: context.leadId ?? row.lead_id,
    latestInboundId: context.latestInboundId,
    conversation: context.conversation,
    lead: context.lead,
    liveSnapshot: context.liveSnapshot,
    analysisPayload: context.analysisPayload,
    inboundActions: context.actionsByInbound.get(row.inbound_message_id) ?? [],
    contextSkipReason: context.contextSkipReason,
  });
}

export function toPublicRecommendationWithPlan(
  row: AiSalesRecommendation,
  context: RecommendationPlanContext
): PublicAiSalesRecommendation {
  return toPublicAiSalesRecommendation(
    row,
    context.latestInboundId,
    planForRecommendation(row, context)
  );
}
