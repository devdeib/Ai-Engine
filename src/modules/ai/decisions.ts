/**
 * Deterministic AI eligibility. Runs BEFORE any LLM call.
 * The model cannot override these rules.
 *
 * Skip reasons:
 * - closed: conversation.status !== open
 * - requires_human: human handoff is active
 * - paused: ai_paused_at is set
 * - no_inbound: thread has no messages
 * - latest_outbound: newest message is already outbound (nothing new to answer)
 * - already_replied: an outbound row already references this inbound id
 */
import type { Conversation, Message } from "@/lib/db/types";
import type { AiDecision } from "@/modules/ai/types";

export function decideAiAction(input: {
  conversation: Pick<Conversation, "status" | "requires_human" | "ai_paused_at">;
  messages: Array<
    Pick<Message, "id" | "direction" | "in_reply_to_message_id">
  >;
}): AiDecision {
  if (input.conversation.status !== "open") {
    return { action: "skip", reason: "closed" };
  }
  if (input.conversation.requires_human) {
    return { action: "skip", reason: "requires_human" };
  }
  if (input.conversation.ai_paused_at) {
    return { action: "skip", reason: "paused" };
  }
  if (input.messages.length === 0) {
    return { action: "skip", reason: "no_inbound" };
  }

  const latest = input.messages[input.messages.length - 1];
  if (!latest) {
    return { action: "skip", reason: "no_inbound" };
  }
  if (latest.direction !== "inbound") {
    return { action: "skip", reason: "latest_outbound" };
  }

  const alreadyReplied = input.messages.some(
    (message) => message.in_reply_to_message_id === latest.id
  );
  if (alreadyReplied) {
    return { action: "skip", reason: "already_replied" };
  }

  return { action: "respond", inboundMessageId: latest.id };
}
