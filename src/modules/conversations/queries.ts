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
import { logger } from "@/lib/logger";
import { isExternalChannel } from "@/modules/channels/constants";
import type {
  Conversation,
  ConversationLeadSummary,
  ConversationStatus,
  ConversationWithLead,
  Message,
  MessageWithDeliveryStatus,
  PublicMessageDeliveryStatus,
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
  userId: string | null,
  conversationId: string
): Promise<ConversationWithLead> {
  if (userId !== null) {
    await requireOrgMembership(organizationId, userId);
  }

  const supabase = await createClient();
  return assertConversationInOrg(supabase, conversationId, organizationId);
}

const PUBLIC_DELIVERY_REF_SELECT = "message_id, organization_id, delivery_status";

/**
 * Maps a channel_message_refs.delivery_status onto the public inbox field.
 * Missing / unknown / unreadable external refs become queued — never sent.
 */
export function publicMessageDeliveryStatus(input: {
  conversationChannel: string;
  direction: Message["direction"];
  refOrganizationId?: string | null;
  expectedOrganizationId: string;
  refStatus?: string | null;
}): PublicMessageDeliveryStatus {
  if (input.direction === "inbound") {
    return null;
  }

  if (!isExternalChannel(input.conversationChannel)) {
    return "not_applicable";
  }

  if (
    input.refOrganizationId != null &&
    input.refOrganizationId !== input.expectedOrganizationId
  ) {
    return "queued";
  }

  if (input.refStatus === "failed") {
    return "failed";
  }

  if (input.refStatus === "sent" || input.refStatus === "delivered") {
    return "sent";
  }

  return "queued";
}

function attachDeliveryStatus(
  messages: Message[],
  conversationChannel: string,
  organizationId: string,
  refByMessageId: Map<
    string,
    { organization_id: string; delivery_status: string | null }
  >
): MessageWithDeliveryStatus[] {
  return messages.map((message) => {
    const ref = refByMessageId.get(message.id);
    return {
      ...message,
      delivery_status: publicMessageDeliveryStatus({
        conversationChannel,
        direction: message.direction,
        expectedOrganizationId: organizationId,
        refOrganizationId: ref?.organization_id,
        refStatus: ref?.delivery_status,
      }),
    };
  });
}

/**
 * Returns messages for a conversation in chronological order (oldest → newest).
 * Secondary sort on id makes pagination deterministic when created_at ties.
 * Outbound rows include a public `delivery_status` projection from
 * channel_message_refs. Does not expose provider errors or job internals.
 */
export async function listConversationMessages(
  organizationId: string,
  userId: string,
  conversationId: string,
  pagination: ConversationsPagination = { page: 1, limit: 20 }
): Promise<MessageWithDeliveryStatus[]> {
  await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();
  const conversation = await assertConversationInOrg(
    supabase,
    conversationId,
    organizationId
  );

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

  const messages = (data ?? []) as Message[];
  const outboundIds = messages
    .filter((message) => message.direction === "outbound")
    .map((message) => message.id);

  if (
    messages.length === 0 ||
    !isExternalChannel(conversation.channel) ||
    outboundIds.length === 0
  ) {
    return attachDeliveryStatus(
      messages,
      conversation.channel,
      organizationId,
      new Map()
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refsQuery = await (supabase.from("channel_message_refs") as any)
    .select(PUBLIC_DELIVERY_REF_SELECT)
    .eq("organization_id", organizationId)
    .eq("direction", "outbound")
    .in("message_id", outboundIds);

  if (refsQuery.error) {
    logger.warn("Failed to fetch channel message delivery status", {
      organizationId,
      code:
        typeof refsQuery.error.code === "string"
          ? refsQuery.error.code
          : "INTERNAL_ERROR",
    });
    return attachDeliveryStatus(
      messages,
      conversation.channel,
      organizationId,
      new Map()
    );
  }

  const refByMessageId = new Map<
    string,
    { organization_id: string; delivery_status: string | null }
  >();

  for (const row of (refsQuery.data ?? []) as Array<{
    message_id?: unknown;
    organization_id?: unknown;
    delivery_status?: unknown;
    provider_error_code?: unknown;
    last_error_code?: unknown;
  }>) {
    if (typeof row.message_id !== "string") continue;
    if (typeof row.organization_id !== "string") continue;
    if (!outboundIds.includes(row.message_id)) continue;

    refByMessageId.set(row.message_id, {
      organization_id: row.organization_id,
      delivery_status:
        typeof row.delivery_status === "string" ? row.delivery_status : null,
    });
  }

  return attachDeliveryStatus(
    messages,
    conversation.channel,
    organizationId,
    refByMessageId
  );
}

/**
 * Most recent messages for a conversation, returned oldest → newest.
 * Used by the AI context builder so it sees the latest inbound, not page 1 of history.
 */
export async function listRecentConversationMessages(
  organizationId: string,
  userId: string | null,
  conversationId: string,
  limit = 20
): Promise<Message[]> {
  if (userId !== null) {
    await requireOrgMembership(organizationId, userId);
  }

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
