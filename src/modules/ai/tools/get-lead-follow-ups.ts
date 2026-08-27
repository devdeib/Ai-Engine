import "server-only";
import { listLeadFollowUps } from "@/modules/follow-ups/queries";
import { AI_CONTEXT_SIDE_LIMIT } from "@/modules/ai/types";
import {
  asEmptyInputTool,
  leadFollowUpsToolOutputSchema,
} from "@/modules/ai/tools/schemas";
import type { AiToolDefinition } from "@/modules/ai/tools/types";

export const getLeadFollowUpsTool: AiToolDefinition = asEmptyInputTool({
  name: "get_lead_follow_ups",
  description:
    "Read existing follow-ups for the current lead. Scope is fixed by the server.",
  outputSchema: leadFollowUpsToolOutputSchema,
  async execute(ctx) {
    const followUps = await listLeadFollowUps(
      ctx.organizationId,
      ctx.userId,
      ctx.leadId,
      { page: 1, limit: AI_CONTEXT_SIDE_LIMIT }
    );
    return {
      followUps: followUps.map((item) => ({
        title: item.title,
        status: item.status,
        dueAt: item.due_at,
      })),
    };
  },
});
