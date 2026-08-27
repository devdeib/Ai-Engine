import { z } from "zod";
import type { AiToolActionStatus, AiToolActionToolName } from "@/lib/db/types";

export const AI_WRITE_TOOL_NAMES = [
  "create_follow_up",
  "create_appointment",
] as const satisfies readonly [AiToolActionToolName, ...AiToolActionToolName[]];

export const rejectAiToolActionSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(500, "Reason must be 500 characters or fewer")
      .optional(),
  })
  .strict();

export const approveAiToolActionSchema = z.object({}).strict();

export const listAiToolActionsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(1),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(20),
  status: z
    .enum([
      "pending",
      "executing",
      "executed",
      "rejected",
      "expired",
      "failed",
    ] as const satisfies readonly [AiToolActionStatus, ...AiToolActionStatus[]])
    .optional(),
  lead_id: z.string().uuid("lead_id must be a valid UUID").optional(),
});

export type RejectAiToolActionInput = z.infer<typeof rejectAiToolActionSchema>;

export interface AiToolActionLeadSummary {
  firstName: string;
  lastName: string;
  companyName: string | null;
}

export interface AiToolActionPublic {
  id: string;
  toolName: AiToolActionToolName;
  trust: "autonomous" | "human_approval";
  status: AiToolActionStatus;
  conversationId: string;
  createdAt: string;
  expiresAt: string | null;
  lead: AiToolActionLeadSummary | null;
  summary: {
    title?: string;
    dueAt?: string;
    startsAt?: string;
    endsAt?: string | null;
    location?: string | null;
    status?: string;
  };
}
