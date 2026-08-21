/**
 * Conversation domain queries — read-only.
 *
 * Security contract (identical to the lead / activity layers):
 * 1. Accept organizationId + userId as explicit parameters.
 * 2. Call requireOrgMembership() first — application-layer tenant gate.
 * 3. Scope every query to organizationId.
 * 4. Cross-tenant IDs return NotFoundError (no existence leakage).
 * 5. PostgreSQL RLS is a second, independent enforcement layer.
 *
 * Lead.owner_id is not an authorization check — any org member may read
 * conversations, matching lead activities.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import type {
  Conversation,
  ConversationLeadSummary,
  ConversationStatus,
  ConversationWithLead,
  Message,
} from "@/lib/db/types";

export interface ConversationsPagination {
  page: number;
  limit: number;
}

export interface ConversationsFilter {
  status?: ConversationStatus;
  leadId?: string;
}

export type ConversationClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Nested select: conversation columns plus inbox-safe lead display fields.
 * Does not expose email, phone, notes, score, or owner.
 */
export const CONVERSATION_WITH_LEAD_SELECT = `
  *,
  lead:leads (
    id,
    first_name,
    last_name,
    company_name
  )
`;

export function toConversationWithLead(row: unknown): ConversationWithLead {
  const raw = row as Conversation & { lead?: unknown };
  const embedded = Array.isArray(raw.lead) ? raw.lead[0] : raw.lead;
  let lead: ConversationLeadSummary | null = null;

  if (
    embedded &&
    typeof embedded === "object" &&
    "id" in embedded &&
    "first_name" in embedded &&
    "last_name" in embedded
  ) {
    const candidate = embedded as ConversationLeadSummary;
    lead = {
      id: candidate.id,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      company_name: candidate.company_name ?? null,
    };
  }

  return { ...(raw as Conversation), lead };
}

/**
 * Verifies that leadId belongs to organizationId.
 * Throws NotFoundError if not — indistinguishable from "lead does not exist".
 */
export async function assertLeadInOrg(
  supabase: ConversationClient,
  leadId: string,
  organizationId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("leads") as any)
    .select("id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Lead");
  }
}

/**
 * Verifies that conversationId belongs to organizationId.
 * Throws NotFoundError if missing or belonging to another org.
 */
export async function assertConversationInOrg(
  supabase: ConversationClient,
  conversationId: string,
  organizationId: string
): Promise<ConversationWithLead> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("conversations") as any)
    .select(CONVERSATION_WITH_LEAD_SELECT)
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Conversation");
  }

  return toConversationWithLead(data);
}

/**
 * Returns conversations for the verified organization, newest-updated first.
 * Each row includes a minimal `lead` object for inbox display.
 */
export async function listConversations(
  organizationId: string,
  userId: string,
  pagination: ConversationsPagination = { page: 1, limit: 20 },
  filter: ConversationsFilter = {}
): Promise<ConversationWithLead[]> {
  await requireOrgMembership(organizationId, userId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("conversations")
    .select(CONVERSATION_WITH_LEAD_SELECT)
    .eq("organization_id", organizationId);

  if (filter.status) {
    query = query.eq("status", filter.status);
  }

  if (filter.leadId) {
    query = query.eq("lead_id", filter.leadId);
  }

  const { data, error } = (await query
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1)) as {
    data: unknown[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`Failed to fetch conversations: ${error.message}`);
  }

  return (data ?? []).map(toConversationWithLead);
}

/**
 * Returns a single conversation scoped to the verified organization.
 */
export async function getConversation(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<ConversationWithLead> {
  await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();
  return assertConversationInOrg(supabase, conversationId, organizationId);
}

/**
 * Returns messages for a conversation in chronological order (oldest → newest).
 * Secondary sort on id makes pagination deterministic when created_at ties.
 */
export async function listConversationMessages(
  organizationId: string,
  userId: string,
  conversationId: string,
  pagination: ConversationsPagination = { page: 1, limit: 20 }
): Promise<Message[]> {
  await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();
  await assertConversationInOrg(supabase, conversationId, organizationId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("messages") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  return (data ?? []) as Message[];
}

/**
 * Most recent messages for a conversation, returned oldest → newest.
 * Used by the AI context builder so it sees the latest inbound, not page 1 of history.
 */
export async function listRecentConversationMessages(
  organizationId: string,
  userId: string,
  conversationId: string,
  limit = 20
): Promise<Message[]> {
  await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();
  await assertConversationInOrg(supabase, conversationId, organizationId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("messages") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  return ((data ?? []) as Message[]).slice().reverse();
}
