/**
 * Zod validation schemas for conversations and messages.
 *
 * IMPORTANT: organization_id, author_user_id, and conversation_id are NEVER
 * included in client-facing schemas.
 * - organization_id comes from the verified server-side URL context.
 * - conversation_id comes from the verified URL path parameter.
 * - author_user_id comes from the authenticated session (or is NULL for
 *   future system/AI messages — never accepted from the client).
 *
 * These schemas describe the caller-supplied shape of conversation/message
 * data. They complement the database constraints in
 * supabase/migrations/20260820000002_conversations.sql.
 */
import { z } from "zod";
import type {
  ConversationChannel,
  ConversationStatus,
  MessageDirection,
} from "@/lib/db/types";

export const MESSAGE_BODY_MAX = 4000;

export const conversationChannelSchema = z.enum([
  "in_app",
] as const satisfies readonly [ConversationChannel, ...ConversationChannel[]]);

export const conversationStatusSchema = z.enum([
  "open",
  "closed",
] as const satisfies readonly [ConversationStatus, ...ConversationStatus[]]);

export const messageDirectionSchema = z.enum([
  "inbound",
  "outbound",
] as const satisfies readonly [MessageDirection, ...MessageDirection[]]);

/**
 * Create a conversation attached to a lead.
 * organization_id is injected server-side from verified context.
 * status defaults to 'open' in the database — not client-supplied.
 * requires_human / ai_paused_at exist on the table (Phase 3.1) but are
 * omitted here so unknown client keys are stripped. Phase 4 will mutate
 * them from trusted server code, never from this public schema.
 */
export const createConversationSchema = z.object({
  lead_id: z.string().uuid("lead_id must be a valid UUID"),
  channel: conversationChannelSchema.default("in_app"),
});

/**
 * Update a conversation. Public API supports status only (open | closed).
 * Handoff fields (requires_human, ai_paused_at) are intentionally absent
 * so they cannot be injected. Phase 4 owns those mutations internally.
 */
export const updateConversationSchema = z.object({
  status: conversationStatusSchema.optional(),
});

export const createMessageSchema = z.object({
  direction: messageDirectionSchema,
  body: z
    .string()
    .trim()
    .min(1, "Message body is required")
    .max(
      MESSAGE_BODY_MAX,
      `Message body must be ${MESSAGE_BODY_MAX} characters or fewer`
    ),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
