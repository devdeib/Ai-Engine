/**
 * Conversation AI handoff state machine (human-operated).
 *
 * Eligible for AI replies:
 *   requires_human = false AND ai_paused_at IS NULL AND status = open
 *
 * pauseAI:
 *   sets ai_paused_at = now()
 *   does not change requires_human
 *
 * escalateToHuman:
 *   sets requires_human = true AND ai_paused_at = now()
 *   AI must not reply until a human resumes
 *
 * resumeAI:
 *   explicit operator action to return the thread to the AI
 *   clears ai_paused_at AND requires_human
 *   AI never calls this itself
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import {
  assertConversationInOrg,
  CONVERSATION_WITH_LEAD_SELECT,
  toConversationWithLead,
} from "@/modules/conversations/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import {
  aiEscalatedContent,
  aiPausedContent,
  aiResumedContent,
} from "@/modules/leads/activities/activity-content";
import type { ConversationWithLead } from "@/lib/db/types";

async function patchHandoff(
  organizationId: string,
  conversationId: string,
  patch: { requires_human?: boolean; ai_paused_at: string | null }
): Promise<ConversationWithLead> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("conversations") as any)
    .update(patch)
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .select(CONVERSATION_WITH_LEAD_SELECT)
    .single();

  if (error || !data) {
    throw new NotFoundError("Conversation");
  }

  return toConversationWithLead(data);
}

export async function pauseAI(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<ConversationWithLead> {
  await requireOrgMembership(organizationId, userId);
  const supabase = await createClient();
  const current = await assertConversationInOrg(
    supabase,
    conversationId,
    organizationId
  );

  const updated = await patchHandoff(organizationId, conversationId, {
    ai_paused_at: new Date().toISOString(),
  });

  await recordLeadActivity({
    organizationId,
    userId,
    leadId: current.lead_id,
    type: "conversation",
    content: aiPausedContent(),
  });

  return updated;
}

export async function resumeAI(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<ConversationWithLead> {
  await requireOrgMembership(organizationId, userId);
  const supabase = await createClient();
  const current = await assertConversationInOrg(
    supabase,
    conversationId,
    organizationId
  );

  const updated = await patchHandoff(organizationId, conversationId, {
    ai_paused_at: null,
    requires_human: false,
  });

  await recordLeadActivity({
    organizationId,
    userId,
    leadId: current.lead_id,
    type: "conversation",
    content: aiResumedContent(),
  });

  return updated;
}

export async function escalateToHuman(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<ConversationWithLead> {
  await requireOrgMembership(organizationId, userId);
  const supabase = await createClient();
  const current = await assertConversationInOrg(
    supabase,
    conversationId,
    organizationId
  );

  const updated = await patchHandoff(organizationId, conversationId, {
    requires_human: true,
    ai_paused_at: new Date().toISOString(),
  });

  await recordLeadActivity({
    organizationId,
    userId,
    leadId: current.lead_id,
    type: "conversation",
    content: aiEscalatedContent(),
  });

  return updated;
}
