/**
 * Follow-up domain queries — read-only.
 *
 * Security contract:
 * 1. organizationId + userId as explicit parameters.
 * 2. requireOrgMembership() first.
 * 3. Scope every query to organizationId.
 * 4. Cross-tenant IDs return NotFoundError.
 * 5. RLS is a second independent gate.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import type {
  ConversationLeadSummary,
  LeadFollowUp,
  LeadFollowUpStatus,
  LeadFollowUpWithLead,
} from "@/lib/db/types";

export interface FollowUpsPagination {
  page: number;
  limit: number;
}

export interface FollowUpsFilter {
  status?: LeadFollowUpStatus;
  assignedUserId?: string | "unassigned";
  leadId?: string;
  overdue?: boolean;
}

export type FollowUpClient = Awaited<ReturnType<typeof createClient>>;

const FOLLOW_UP_WITH_LEAD_SELECT = `
  *,
  lead:leads (
    id,
    first_name,
    last_name,
    company_name
  )
`;

export function toFollowUpWithLead(row: unknown): LeadFollowUpWithLead {
  const raw = row as LeadFollowUp & { lead?: unknown };
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

  return { ...(raw as LeadFollowUp), lead };
}

export async function assertLeadInOrg(
  supabase: FollowUpClient,
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

export async function assertFollowUpInOrg(
  supabase: FollowUpClient,
  followUpId: string,
  organizationId: string
): Promise<LeadFollowUp> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("lead_follow_ups") as any)
    .select("*")
    .eq("id", followUpId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Follow-up");
  }

  return data as LeadFollowUp;
}

/**
 * Follow-ups for a single lead.
 * Ordered: pending first (enum order), then due_at ASC, then id ASC.
 */
export async function listLeadFollowUps(
  organizationId: string,
  userId: string | null,
  leadId: string,
  pagination: FollowUpsPagination = { page: 1, limit: 20 }
): Promise<LeadFollowUp[]> {
  if (userId !== null) {
    await requireOrgMembership(organizationId, userId);
  }

  const supabase = await createClient();
  await assertLeadInOrg(supabase, leadId, organizationId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("lead_follow_ups") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("status", { ascending: true })
    .order("due_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch follow-ups: ${error.message}`);
  }

  return (data ?? []) as LeadFollowUp[];
}

export async function getLeadFollowUp(
  organizationId: string,
  userId: string,
  followUpId: string
): Promise<LeadFollowUp> {
  await requireOrgMembership(organizationId, userId);
  const supabase = await createClient();
  return assertFollowUpInOrg(supabase, followUpId, organizationId);
}

/**
 * Organization-wide follow-up queue with optional filters.
 * Embeds minimal lead display fields to avoid N+1 fetches.
 */
export async function listFollowUps(
  organizationId: string,
  userId: string,
  pagination: FollowUpsPagination = { page: 1, limit: 20 },
  filter: FollowUpsFilter = {}
): Promise<LeadFollowUpWithLead[]> {
  await requireOrgMembership(organizationId, userId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("lead_follow_ups")
    .select(FOLLOW_UP_WITH_LEAD_SELECT)
    .eq("organization_id", organizationId);

  if (filter.leadId) {
    query = query.eq("lead_id", filter.leadId);
  }

  if (filter.assignedUserId === "unassigned") {
    query = query.is("assigned_user_id", null);
  } else if (filter.assignedUserId) {
    query = query.eq("assigned_user_id", filter.assignedUserId);
  }

  if (filter.overdue) {
    query = query
      .eq("status", "pending")
      .lt("due_at", new Date().toISOString());
  } else if (filter.status) {
    query = query.eq("status", filter.status);
  }

  const { data, error } = (await query
    .order("status", { ascending: true })
    .order("due_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1)) as {
    data: unknown[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`Failed to fetch follow-ups: ${error.message}`);
  }

  return (data ?? []).map(toFollowUpWithLead);
}
