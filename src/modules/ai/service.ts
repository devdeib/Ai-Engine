/**
 * Server-side AI execution. The browser never calls the LLM.
 *
 * Pipeline:
 *   authorize → load conversation/messages → eligibility decision
 *     → (skipped | escalated) without an LLM call
 *     → build context → prompt → provider loop (optional tools)
 *     → validate output → rebuild snapshot → advisory analysis
 *     → server-owned recommendation → isolated execution gate
 *     → insert AI message → record activity
 *
 * Identity (organizationId, userId, conversationId) comes from trusted
 * route context. Actor type is always "ai" for generated messages.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { ConflictError, ValidationError } from "@/lib/errors";
import {
  CONVERSATION_WITH_LEAD_SELECT,
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import { aiResponseGeneratedContent } from "@/modules/leads/activities/activity-content";
import { buildAiContext } from "@/modules/ai/context";
import { decideAiAction } from "@/modules/ai/decisions";
import { getSalesAgentPrompt } from "@/modules/ai/prompts";
import { createAiProvider } from "@/modules/ai/providers";
import {
  normalizeProviderTurn,
  type AiProvider,
} from "@/modules/ai/providers/types";
import { validateAiReply } from "@/modules/ai/schema";
import {
  AI_CONTEXT_MESSAGE_LIMIT,
  AI_MAX_TOOL_CALLS,
  type AiContext,
  type AiExecutionResult,
  type AiPipelineSnapshot,
  type AiProviderHistoryItem,
  type AiSkipReason,
} from "@/modules/ai/types";
import { AiToolError } from "@/modules/ai/errors";
import { listAiToolDescriptors, runAiToolCall } from "@/modules/ai/tools";
import type { AiToolContext } from "@/modules/ai/tools/types";
import type { AiSalesAnalysis, Message } from "@/lib/db/types";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import { persistAiSalesAnalysis } from "@/modules/ai/analysis/persist";
import { validateAiSalesAnalysis } from "@/modules/ai/analysis/schema";
import { getSalesAnalysisPrompt } from "@/modules/ai/analysis/prompt";
import { AiSalesAnalysisError } from "@/modules/ai/analysis/errors";
import {
  AI_SALES_ANALYSIS_SCHEMA_VERSION,
} from "@/modules/ai/analysis/constants";
import { persistAiSalesRecommendation } from "@/modules/ai/recommendation/persist";
import {
  conservativeRecommendation,
  recommend,
} from "@/modules/ai/recommendation/policy";
import { AiSalesRecommendationError } from "@/modules/ai/recommendation/errors";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import type { AiSalesRecommendationDecision } from "@/modules/ai/recommendation/schema";
import { executeFromRecommendation } from "@/modules/ai/execution/execute";
import { AiSalesRecommendationExecutionError } from "@/modules/ai/execution/errors";
import { logger } from "@/lib/logger";
import {
  auditActorFromPrincipal,
  principalUserId,
  type AiExecutionPrincipal,
} from "@/modules/ai/principal";
import { enqueueOutboundDeliveryIfExternal } from "@/modules/channels/delivery/enqueue";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

async function recoverOutboundDeliveryIfNeeded(input: {
  organizationId: string;
  conversation: {
    channel: string;
    channel_account_id: string | null;
    channel_identity_id: string | null;
  };
  messages: Message[];
  reason: AiSkipReason;
}): Promise<void> {
  if (input.reason !== "already_replied" && input.reason !== "latest_outbound") {
    return;
  }

  const latestOutbound = [...input.messages]
    .reverse()
    .find((message) => message.direction === "outbound");
  if (!latestOutbound) {
    return;
  }

  await enqueueOutboundDeliveryIfExternal({
    organizationId: input.organizationId,
    conversation: input.conversation,
    messageId: latestOutbound.id,
  });
}

export interface ProcessConversationMessageOptions {
  provider?: AiProvider;
}

export async function processConversationMessage(
  organizationId: string,
  conversationId: string,
  principal: AiExecutionPrincipal,
  options: ProcessConversationMessageOptions = {}
): Promise<AiExecutionResult> {
  const userId = principalUserId(principal);
  if (principal.kind === "operator") {
    await requireOrgMembership(organizationId, principal.userId);
  }

  const conversation = await getConversation(
    organizationId,
    userId,
    conversationId
  );
  const actor = auditActorFromPrincipal(
    principal,
    conversation.channel_identity_id
  );
  if (principal.kind === "channel_ingress" && !actor.channelIdentityId) {
    throw new ValidationError("channel_ingress requires a channel identity");
  }

  const messages = await listRecentConversationMessages(
    organizationId,
    userId,
    conversationId,
    AI_CONTEXT_MESSAGE_LIMIT
  );

  const decision = decideAiAction({ conversation, messages });
  if (decision.action === "skip") {
    await recoverOutboundDeliveryIfNeeded({
      organizationId,
      conversation,
      messages,
      reason: decision.reason,
    });
    if (decision.reason === "requires_human") {
      return { outcome: "escalated", reason: "requires_human" };
    }
    return { outcome: "skipped", reason: decision.reason };
  }

  const context = await buildAiContext({
    organizationId,
    userId,
    conversationId,
    inboundMessageId: decision.inboundMessageId,
    preloadedConversation: conversation,
    preloadedMessages: messages,
  });
  const prompt = getSalesAgentPrompt();
  const provider = options.provider ?? createAiProvider();
  const tools = listAiToolDescriptors();
  const history: AiProviderHistoryItem[] = [];
  const toolContext: AiToolContext = {
    organizationId,
    userId,
    triggerSource: actor.triggerSource,
    channelIdentityId: actor.channelIdentityId,
    conversationId,
    leadId: conversation.lead_id,
    inboundMessageId: decision.inboundMessageId,
  };

  let toolCallCount = 0;
  let body: string;

  for (;;) {
    const generated = await provider.generateResponse({
      systemPrompt: prompt.systemPrompt,
      promptVersion: prompt.version,
      context,
      tools,
      history,
    });
    const turn = normalizeProviderTurn(generated);

    if (turn.type === "text") {
      body = validateAiReply(turn.text);
      break;
    }

    toolCallCount += 1;
    if (toolCallCount > AI_MAX_TOOL_CALLS) {
      throw new AiToolError("AI_TOOL_LIMIT_EXCEEDED");
    }

    const result = await runAiToolCall(turn, toolContext);
    history.push({ role: "assistant", turn });
    history.push({
      role: "tool",
      id: turn.id,
      name: turn.name,
      result,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Persist the AI message and enqueue delivery BEFORE advisory work.   */
  /* Advisory analysis, recommendation, and execution are non-blocking  */
  /* CRM enrichment — they must not delay the customer-facing response. */
  /* ------------------------------------------------------------------ */

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("messages") as any)
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      author_user_id: null,
      author_type: "ai",
      direction: "outbound",
      body,
      in_reply_to_message_id: decision.inboundMessageId,
    })
    .select()
    .single();

  if (isUniqueViolation(error)) {
    throw new ConflictError("An AI reply already exists for this message");
  }
  if (error || !data) {
    throw new Error("Failed to persist AI message");
  }

  const activity = await recordLeadActivity({
    organizationId,
    userId,
    leadId: conversation.lead_id,
    type: "ai",
    content: aiResponseGeneratedContent(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bump = await (supabase.from("conversations") as any)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .select(CONVERSATION_WITH_LEAD_SELECT)
    .single();

  if (bump.error) {
    throw new Error("Failed to update conversation recency");
  }

  const message = data as Message;
  await enqueueOutboundDeliveryIfExternal({
    organizationId,
    conversation,
    messageId: message.id,
  });

  /* ------------------------------------------------------------------ */
  /* Advisory analysis, recommendation, and execution run after delivery */
  /* is enqueued so the customer receives the response without waiting.  */
  /* Failures here are logged but never block the responded outcome.     */
  /* ------------------------------------------------------------------ */

  const inbound = messages.find((m) => m.id === decision.inboundMessageId);
  try {
    const pipeline = await buildPipelineSnapshot({
      organizationId,
      leadId: conversation.lead_id,
      conversationId,
      leadStatus: context.lead.status,
      conversationStatus: context.conversation.status,
      requiresHuman: context.conversation.requiresHuman,
      aiPausedAt: context.conversation.aiPausedAt,
      contactEmailPresent: Boolean(
        context.lead.email && context.lead.email.trim()
      ),
      contactPhonePresent: Boolean(
        context.lead.phone && context.lead.phone.trim()
      ),
      messages: context.messages.map((m) => ({
        direction: m.direction,
        createdAt: m.createdAt,
      })),
    });
    context.pipeline = pipeline;

    const analysisRow = await recordAdvisoryAnalysis({
      provider,
      context,
      pipeline,
      conversationId,
      organizationId,
      userId,
      triggerSource: actor.triggerSource,
      channelIdentityId: actor.channelIdentityId,
      leadId: conversation.lead_id,
      inboundMessageId: decision.inboundMessageId,
      inboundMessageCreatedAt: inbound?.created_at ?? new Date().toISOString(),
      draftReply: body,
    });

    await recordSalesRecommendation({
      pipeline,
      analysisRow,
      conversationId,
      organizationId,
      userId,
      triggerSource: actor.triggerSource,
      channelIdentityId: actor.channelIdentityId,
      leadId: conversation.lead_id,
      inboundMessageId: decision.inboundMessageId,
      inboundMessageCreatedAt: inbound?.created_at ?? new Date().toISOString(),
    });

    await runRecommendationExecution({
      organizationId,
      userId,
      triggerSource: actor.triggerSource,
      channelIdentityId: actor.channelIdentityId,
      conversationId,
      leadId: conversation.lead_id,
      inboundMessageId: decision.inboundMessageId,
      analysisPayload:
        analysisRow?.status === "recorded"
          ? validateAiSalesAnalysis(analysisRow.payload)
          : null,
    });
  } catch {
    logger.error("Post-response advisory processing failed", {
      organizationId,
      conversationId,
      code: "ADVISORY_PROCESSING_FAILED",
    });
  }

  return {
    outcome: "responded",
    messageId: message.id,
    activityId: activity.id,
  };
}

async function recordAdvisoryAnalysis(input: {
  provider: AiProvider;
  context: AiContext;
  pipeline: AiPipelineSnapshot;
  organizationId: string;
  userId: string | null;
  triggerSource: "operator" | "channel_ingress";
  channelIdentityId: string | null;
  conversationId: string;
  leadId: string;
  inboundMessageId: string;
  inboundMessageCreatedAt: string;
  draftReply: string;
}): Promise<AiSalesAnalysis | null> {
  try {
    input.context.pipeline = input.pipeline;

    let payload = null;
    let errorCode: "AI_MALFORMED_ANALYSIS" | "AI_PROVIDER_ERROR" | null =
      "AI_MALFORMED_ANALYSIS";

    if (typeof input.provider.generateSalesAnalysis === "function") {
      try {
        const analysisPrompt = getSalesAnalysisPrompt();
        const raw = await input.provider.generateSalesAnalysis({
          systemPrompt: analysisPrompt.systemPrompt,
          promptVersion: analysisPrompt.version,
          schemaVersion: AI_SALES_ANALYSIS_SCHEMA_VERSION,
          context: input.context,
          draftReply: input.draftReply,
        });
        payload = validateAiSalesAnalysis(raw);
        errorCode = payload ? null : "AI_MALFORMED_ANALYSIS";
      } catch (error) {
        payload = null;
        errorCode =
          error instanceof AiSalesAnalysisError
            ? error.code
            : "AI_PROVIDER_ERROR";
      }
    }

    return await persistAiSalesAnalysis({
      organizationId: input.organizationId,
      userId: input.userId,
      triggerSource: input.triggerSource,
      channelIdentityId: input.channelIdentityId,
      conversationId: input.conversationId,
      leadId: input.leadId,
      inboundMessageId: input.inboundMessageId,
      inboundMessageCreatedAt: input.inboundMessageCreatedAt,
      providerName: input.provider.name,
      pipeline: input.pipeline,
      payload,
      errorCode,
    });
  } catch (error) {
    logger.error("Advisory sales analysis failed", {
      organizationId: input.organizationId,
      userId: input.userId,
      conversationId: input.conversationId,
      code:
        error instanceof AiSalesAnalysisError
          ? error.code
          : "AI_MALFORMED_ANALYSIS",
    });
    return null;
  }
}

async function recordSalesRecommendation(input: {
  pipeline: AiPipelineSnapshot;
  analysisRow: AiSalesAnalysis | null;
  organizationId: string;
  userId: string | null;
  triggerSource: "operator" | "channel_ingress";
  channelIdentityId: string | null;
  conversationId: string;
  leadId: string;
  inboundMessageId: string;
  inboundMessageCreatedAt: string;
}): Promise<void> {
  try {
    const analysisPayload =
      input.analysisRow?.status === "recorded"
        ? validateAiSalesAnalysis(input.analysisRow.payload)
        : null;

    let decision: AiSalesRecommendationDecision;
    let errorCode: "AI_RECOMMENDATION_FAILED" | null = null;
    try {
      decision = recommend(input.pipeline, analysisPayload);
    } catch (error) {
      logger.error("Sales recommendation policy failed", {
        organizationId: input.organizationId,
        userId: input.userId,
        conversationId: input.conversationId,
        code:
          error instanceof AiSalesRecommendationError
            ? error.code
            : "AI_RECOMMENDATION_FAILED",
      });
      errorCode = "AI_RECOMMENDATION_FAILED";
      try {
        decision = conservativeRecommendation(input.pipeline);
      } catch {
        decision = {
          recommendedAction: "wait_for_customer",
          reasonCodes: ["analysis_unavailable"],
          requiresHumanApproval: false,
          mappedToolName: null,
        };
      }
    }

    const stored = await persistAiSalesRecommendation({
      organizationId: input.organizationId,
      userId: input.userId,
      triggerSource: input.triggerSource,
      channelIdentityId: input.channelIdentityId,
      conversationId: input.conversationId,
      leadId: input.leadId,
      inboundMessageId: input.inboundMessageId,
      inboundMessageCreatedAt: input.inboundMessageCreatedAt,
      analysisId: input.analysisRow?.id ?? null,
      analysisStatus: input.analysisRow?.status ?? null,
      analysisPayload,
      pipeline: input.pipeline,
      decision,
      errorCode,
    });

    if (stored) {
      logger.info("AI sales recommendation recorded", {
        organizationId: input.organizationId,
        userId: input.userId,
        conversationId: input.conversationId,
        recommendedAction: stored.recommended_action,
        status: stored.status,
        policyVersion: AI_SALES_RECOMMENDATION_POLICY_V1,
      });
    }
  } catch (error) {
    logger.error("Advisory sales recommendation failed", {
      organizationId: input.organizationId,
      userId: input.userId,
      conversationId: input.conversationId,
      code:
        error instanceof AiSalesRecommendationError
          ? error.code
          : "AI_RECOMMENDATION_FAILED",
    });
  }
}

async function runRecommendationExecution(input: {
  organizationId: string;
  userId: string | null;
  triggerSource: "operator" | "channel_ingress";
  channelIdentityId: string | null;
  conversationId: string;
  leadId: string;
  inboundMessageId: string;
  analysisPayload: ReturnType<typeof validateAiSalesAnalysis>;
}): Promise<void> {
  try {
    await executeFromRecommendation(input);
  } catch (error) {
    logger.error("AI sales recommendation execution failed", {
      organizationId: input.organizationId,
      userId: input.userId,
      conversationId: input.conversationId,
      code:
        error instanceof AiSalesRecommendationExecutionError
          ? error.code
          : "AI_RECOMMENDATION_EXECUTION_FAILED",
    });
  }
}
