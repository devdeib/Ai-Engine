/**
 * Server-side AI execution. The browser never calls the LLM.
 *
 * Identity (organizationId, userId, conversationId) comes from trusted
 * route context. Actor type is always "ai" for generated messages.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { ConflictError } from "@/lib/errors";
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
import type { AiProvider } from "@/modules/ai/providers/types";
import { sanitizeAiReply } from "@/modules/ai/schema";
import { AI_CONTEXT_MESSAGE_LIMIT, type AiExecutionResult } from "@/modules/ai/types";
import type { Message } from "@/lib/db/types";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

export interface ProcessConversationMessageOptions {
  provider?: AiProvider;
}

export async function processConversationMessage(
  organizationId: string,
  userId: string,
  conversationId: string,
  options: ProcessConversationMessageOptions = {}
): Promise<AiExecutionResult> {
  await requireOrgMembership(organizationId, userId);

  const conversation = await getConversation(
    organizationId,
    userId,
    conversationId
  );
  const messages = await listRecentConversationMessages(
    organizationId,
    userId,
    conversationId,
    AI_CONTEXT_MESSAGE_LIMIT
  );

  const decision = decideAiAction({ conversation, messages });
  if (decision.action === "skip") {
    return { outcome: "skipped", reason: decision.reason };
  }

  const context = await buildAiContext({
    organizationId,
    userId,
    conversationId,
  });
  const prompt = getSalesAgentPrompt();
  const provider = options.provider ?? createAiProvider();
  const generated = await provider.generateResponse({
    systemPrompt: prompt.systemPrompt,
    promptVersion: prompt.version,
    context,
  });
  const body = sanitizeAiReply(generated.text);

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
    throw new Error(`Failed to create AI message: ${error?.message}`);
  }

  await recordLeadActivity({
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
    throw new Error(`Failed to update conversation recency: ${bump.error.message}`);
  }

  const message = data as Message;
  return { outcome: "responded", messageId: message.id };
}
