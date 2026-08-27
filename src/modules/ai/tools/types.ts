/**
 * Trusted server-side context for AI tools.
 * Identity is never accepted from the model.
 */
import type { z } from "zod";
import type { AiToolName } from "@/modules/ai/types";

export interface AiToolContext {
  organizationId: string;
  userId: string | null;
  triggerSource: "operator" | "channel_ingress";
  channelIdentityId: string | null;
  conversationId: string;
  leadId: string;
  inboundMessageId: string;
}

export type AiToolTrust = "autonomous" | "human_approval";

export const EMPTY_TOOL_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

export interface AiToolDefinition {
  name: AiToolName;
  description: string;
  trust: AiToolTrust;
  inputSchema: z.ZodType<unknown>;
  outputSchema: z.ZodType<unknown>;
  inputJsonSchema: Record<string, unknown>;
  execute: (ctx: AiToolContext, input: unknown) => Promise<unknown>;
}

export type AiToolResultEnvelope =
  | { ok: true; name: AiToolName | string; data: unknown }
  | { ok: false; name: string; code: string };
