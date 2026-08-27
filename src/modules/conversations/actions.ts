/**
 * Conversation domain mutations — create conversation, update status, append message.
 *
 * Security contract (identical to queries.ts):
 * 1. Accept organizationId + userId as explicit parameters.
 * 2. Call requireOrgMembership() first.
 * 3. Validate caller-supplied input with Zod.
 * 4. Inject organization_id / conversation_id / author_user_id from verified context.
 * 5. Scope every write to the verified organizationId.
 * 6. RLS remains the independent database-layer gate.
 *
 * Messages are append-only. There is no update/delete in this module.
 * requires_human and ai_paused_at are not writable through these functions.
 * Phase 4 will add trusted internal mutations; do not accept them from input.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  createConversationSchema,
  createMessageSchema,
  updateConversationSchema,
} from "@/modules/conversations/schema";
import {
  CONVERSATION_WITH_LEAD_SELECT,
  assertConversationInOrg,
  assertLeadInOrg,
  toConversationWithLead,
} from "@/modules/conversations/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import {
  conversationStartedContent,
  messageActivityContent,
} from "@/modules/leads/activities/activity-content";
import { triggerAiAfterInboundMessage } from "@/modules/ai/trigger";
import { enqueueOutboundDeliveryIfExternal } from "@/modules/channels/delivery/enqueue";
import type { ConversationWithLead, Message } from "@/lib/db/types";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

// ---------------------------------------------------------------------------
// createConversation
// ---------------------------------------------------------------------------

/**
 * Creates an in-app conversation for a lead in the verified organization.
 *
 * organization_id always comes from the verified argument.
 * Duplicate open in_app conversations for the same lead raise ConflictError
 * (HTTP 409). The unique index is the authority; a pre-check is a friendly
 * fast-path and the unique-violation handler covers races.
 */
export async function createConversation(
  organizationId: string,
  userId: string,
  input: unknown
): Promise<ConversationWithLead> {
  await requireOrgMembership(organizationId, userId);

  const parsed = createConversationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid conversation data",
      parsed.error.flatten().fieldErrors
    );
  }

  const supabase = await createClient();
  await assertLeadInOrg(supabase, parsed.data.lead_id, organizationId);

  // Friendly pre-check: one open in_app thread per lead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (supabase.from("conversations") as any)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("lead_id", parsed.data.lead_id)
    .eq("channel", parsed.data.channel)
    .eq("status", "open")
    .maybeSingle();

  if (existing.data) {
    throw new ConflictError("An open conversation already exists for this lead");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("conversations") as any)
    .insert({
      organization_id: organizationId,
      lead_id: parsed.data.lead_id,
      channel: parsed.data.channel,
    })
    .select(CONVERSATION_WITH_LEAD_SELECT)
    .single();

  if (isUniqueViolation(error)) {
    throw new ConflictError("An open conversation already exists for this lead");
  }

  if (error || !data) {
    throw new Error(`Failed to create conversation: ${error?.message}`);
  }

  const conversation = toConversationWithLead(data);
  await recordLeadActivity({
    organizationId,
    userId,
    leadId: conversation.lead_id,
    type: "conversation",
    content: conversationStartedContent(),
  });

  return conversation;
}

// ---------------------------------------------------------------------------
// updateConversation
// ---------------------------------------------------------------------------

/**
 * Updates conversation status only (open | closed).
 * Handoff fields are stripped by updateConversationSchema and never written.
 */
export async function updateConversation(
  organizationId: string,
  userId: string,
  conversationId: string,
  input: unknown
): Promise<ConversationWithLead> {
  await requireOrgMembership(organizationId, userId);

  const parsed = updateConversationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid conversation data",
      parsed.error.flatten().fieldErrors
    );
  }

  const supabase = await createClient();

  if (parsed.data.status === undefined) {
    return assertConversationInOrg(supabase, conversationId, organizationId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("conversations") as any)
    .update({ status: parsed.data.status })
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .select(CONVERSATION_WITH_LEAD_SELECT)
    .single();

  if (error || !data) {
    throw new NotFoundError("Conversation");
  }

  return toConversationWithLead(data);
}

// ---------------------------------------------------------------------------
// createConversationMessage
// ---------------------------------------------------------------------------

/**
 * Appends a human-authored message to a conversation.
 *
 * author_user_id is always the authenticated userId — never from the body.
 * Both inbound and outbound Phase 3 messages are human-operated.
 * After a successful insert, the parent conversation's updated_at is bumped
 * so the inbox sorts by recency.
 *
 * Human inbound messages then invoke the Phase 4.1 pipeline. AI failures
 * after persist do not roll back the inbound message.
 */
export async function createConversationMessage(
  organizationId: string,
  userId: string,
  conversationId: string,
  input: unknown
): Promise<Message> {
  await requireOrgMembership(organizationId, userId);

  const parsed = createMessageSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid message data",
      parsed.error.flatten().fieldErrors
    );
  }

  const supabase = await createClient();
  const conversation = await assertConversationInOrg(
    supabase,
    conversationId,
    organizationId
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("messages") as any)
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      author_user_id: userId,
      author_type: "human",
      direction: parsed.data.direction,
      body: parsed.data.body,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create message: ${error?.message}`);
  }

  await recordLeadActivity({
    organizationId,
    userId,
    leadId: conversation.lead_id,
    type: "conversation",
    content: messageActivityContent(parsed.data.direction),
  });

  // Bump inbox recency. Failure here does not roll back the message; surface it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bump = await (supabase.from("conversations") as any)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("organization_id", organizationId);

  if (bump.error) {
    throw new Error(`Failed to update conversation recency: ${bump.error.message}`);
  }

  const message = data as Message;
  if (parsed.data.direction === "outbound") {
    await enqueueOutboundDeliveryIfExternal({
      organizationId,
      conversation,
      messageId: message.id,
    });
  }

  await triggerAiAfterInboundMessage({
    organizationId,
    userId,
    conversationId,
    message,
  });

  return message;
}
