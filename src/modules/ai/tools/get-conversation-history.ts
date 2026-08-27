import "server-only";
import { listRecentConversationMessages } from "@/modules/conversations/queries";
import { AI_CONTEXT_MESSAGE_LIMIT } from "@/modules/ai/types";
import { mapAuthorTypeForAiContext } from "@/modules/ai/principal";
import {
  asEmptyInputTool,
  conversationHistoryToolOutputSchema,
} from "@/modules/ai/tools/schemas";
import type { AiToolDefinition } from "@/modules/ai/tools/types";

export const getConversationHistoryTool: AiToolDefinition = asEmptyInputTool({
  name: "get_conversation_history",
  description:
    "Read recent messages in the current conversation. Scope is fixed by the server.",
  outputSchema: conversationHistoryToolOutputSchema,
  async execute(ctx) {
    const messages = await listRecentConversationMessages(
      ctx.organizationId,
      ctx.userId,
      ctx.conversationId,
      AI_CONTEXT_MESSAGE_LIMIT
    );
    return {
      messages: messages.map((message) => ({
        direction: message.direction,
        authorType: mapAuthorTypeForAiContext(message.author_type),
        body: message.body,
        createdAt: message.created_at,
      })),
    };
  },
});
