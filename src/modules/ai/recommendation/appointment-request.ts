/**
 * Phase 4.10: operator-scheduled appointment HITL from a live-validated
 * suggest_appointment_approval recommendation. Never books. Never invents time.
 */
import "server-only";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
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
import { requestCreateAppointment } from "@/modules/ai/actions/write";
import { hashAiToolInput } from "@/modules/ai/actions/hash";
import {
  effectiveAiToolActionStatus,
  toPublicAiToolAction,
} from "@/modules/ai/actions/map";
import {
  getAiToolAction,
  loadAiToolActionByInboundHash,
} from "@/modules/ai/actions/queries";
import {
  createAppointmentToolInputSchema,
  type CreateAppointmentToolInput,
} from "@/modules/ai/tools/write-schemas";
import type { AiToolContext } from "@/modules/ai/tools/types";
import type { AiToolActionPublic } from "@/modules/ai/actions/schema";
import type { AiSalesRecommendation } from "@/lib/db/types";
import type { AiSalesRecommendationDecision } from "@/modules/ai/recommendation/schema";

export interface RequestAppointmentHitlInput {
  organizationId: string;
  userId: string;
  conversationId: string;
  payload: unknown;
}

function blocked(): never {
  throw new ConflictError(
    "This recommendation cannot create an appointment request"
  );
}

function isPersistedAppointmentHitl(
  persisted: AiSalesRecommendation
): boolean {
  return (
    persisted.recommended_action === "suggest_appointment_approval" &&
    persisted.mapped_tool_name === "create_appointment" &&
    persisted.requires_human_approval === true
  );
}

function isLiveAppointmentHitl(
  fresh: AiSalesRecommendationDecision
): boolean {
  return (
    fresh.recommendedAction === "suggest_appointment_approval" &&
    fresh.mappedToolName === "create_appointment" &&
    fresh.requiresHumanApproval === true
  );
}

function appointmentHashPayload(
  input: CreateAppointmentToolInput
): Record<string, unknown> {
  return {
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    location: input.location ?? null,
    notes: input.notes ?? null,
  };
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

export async function requestAppointmentHitlFromRecommendation(
  input: RequestAppointmentHitlInput
): Promise<AiToolActionPublic> {
  const parsed = createAppointmentToolInputSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new ValidationError(
      "Validation failed",
      parsed.error.flatten().fieldErrors
    );
  }
  const humanPayload = parsed.data;

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
  if (liveSnapshot.hasScheduledAppointment) {
    blocked();
  }
  if (!isPersistedAppointmentHitl(recommendation)) {
    blocked();
  }

  const inputHash = hashAiToolInput(appointmentHashPayload(humanPayload));

  if (liveSnapshot.hasPendingAppointmentApproval) {
    const existing = await loadAiToolActionByInboundHash(
      input.organizationId,
      recommendation.inbound_message_id,
      "create_appointment",
      inputHash
    );
    if (!existing || effectiveAiToolActionStatus(existing) !== "pending") {
      blocked();
    }
  } else {
    const analysisPayload = await loadCurrentAnalysisPayload(
      input.organizationId,
      input.userId,
      input.conversationId
    );
    const fresh = recommend(liveSnapshot, analysisPayload);
    if (!decisionsMatch(recommendation, fresh) || !isLiveAppointmentHitl(fresh)) {
      blocked();
    }
  }

  const toolContext: AiToolContext = {
    organizationId: input.organizationId,
    userId: input.userId,
    triggerSource: "operator",
    channelIdentityId: null,
    conversationId: input.conversationId,
    leadId: lead.id,
    inboundMessageId: recommendation.inbound_message_id,
  };

  await requestCreateAppointment(toolContext, humanPayload);

  const stored = await loadAiToolActionByInboundHash(
    input.organizationId,
    recommendation.inbound_message_id,
    "create_appointment",
    inputHash
  );
  if (!stored) {
    throw new Error("Failed to record AI tool action");
  }
  if (effectiveAiToolActionStatus(stored) !== "pending") {
    blocked();
  }

  const action = await getAiToolAction(
    input.organizationId,
    input.userId,
    stored.id
  );
  return toPublicAiToolAction(action);
}
