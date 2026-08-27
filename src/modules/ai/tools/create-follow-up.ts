import "server-only";
import { executeCreateFollowUp } from "@/modules/ai/actions/write";
import type { AiToolDefinition } from "@/modules/ai/tools/types";
import {
  CREATE_FOLLOW_UP_JSON_SCHEMA,
  createFollowUpToolInputSchema,
  createFollowUpToolOutputSchema,
  type CreateFollowUpToolInput,
} from "@/modules/ai/tools/write-schemas";

export const createFollowUpTool: AiToolDefinition = {
  name: "create_follow_up",
  trust: "autonomous",
  description:
    "Create an internal follow-up task for the current lead. Scope is fixed by the server.",
  inputSchema: createFollowUpToolInputSchema,
  outputSchema: createFollowUpToolOutputSchema,
  inputJsonSchema: { ...CREATE_FOLLOW_UP_JSON_SCHEMA },
  async execute(ctx, input) {
    return executeCreateFollowUp(ctx, input as CreateFollowUpToolInput);
  },
};
