import { z } from "zod";
import { EMPTY_TOOL_JSON_SCHEMA, type AiToolDefinition } from "@/modules/ai/tools/types";

export const emptyAiToolInputSchema = z.object({}).strict();

export const leadContextToolOutputSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    companyName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    status: z.enum([
      "new",
      "contacted",
      "qualified",
      "unqualified",
      "lost",
      "converted",
    ]),
    score: z.number().nullable(),
    notes: z.string().nullable(),
  })
  .strict();

export const conversationHistoryToolOutputSchema = z
  .object({
    messages: z.array(
      z
        .object({
          direction: z.enum(["inbound", "outbound"]),
          authorType: z.enum(["human", "ai", "system"]),
          body: z.string(),
          createdAt: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export const leadAppointmentsToolOutputSchema = z
  .object({
    appointments: z.array(
      z
        .object({
          status: z.enum(["scheduled", "completed", "cancelled"]),
          startsAt: z.string(),
          location: z.string().nullable(),
        })
        .strict()
    ),
  })
  .strict();

export const leadFollowUpsToolOutputSchema = z
  .object({
    followUps: z.array(
      z
        .object({
          title: z.string(),
          status: z.enum(["pending", "completed", "cancelled"]),
          dueAt: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export function emptyInputJsonSchema(): Record<string, unknown> {
  return { ...EMPTY_TOOL_JSON_SCHEMA };
}

export function asEmptyInputTool(
  tool: Omit<AiToolDefinition, "inputSchema" | "inputJsonSchema" | "trust">
): AiToolDefinition {
  return {
    ...tool,
    trust: "autonomous",
    inputSchema: emptyAiToolInputSchema,
    inputJsonSchema: emptyInputJsonSchema(),
  };
}
