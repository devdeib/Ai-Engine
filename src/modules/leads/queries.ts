/**
 * Lead domain queries — read-only.
 *
 * All functions follow the same security contract used throughout the project:
 * 1. Accept organizationId + userId as explicit parameters.
 * 2. Call requireOrgMembership() first — application-layer tenant gate.
 * 3. Then issue the Supabase query scoped to that organizationId.
 * 4. PostgreSQL RLS provides a second, independent enforcement layer via
 *    auth_user_role_in_org() (introduced in migration 000002).
 *
 * NEVER accept organizationId from an untrusted source as an authorization
 * grant.  The caller is responsible for deriving organizationId from the
 * authenticated session (e.g. via getOrgContext in src/lib/api/auth.ts).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import { CHANNEL_STUB_LEAD_EXCLUDE_OR } from "@/modules/channels/match";
import type { Lead, LeadSource, LeadStatus } from "@/lib/db/types";

export interface LeadsPagination {
  page: number;
  limit: number;
}

/** Fields by which the lead list can be sorted. */
export type LeadSortField =
  | "created_at"
  | "first_name"
  | "last_name"
  | "status"
  | "score";

export type LeadSortOrder = "asc" | "desc";

/**
 * Optional server-side filter applied to the lead list query.
 * All filtering, searching, and sorting happens in PostgreSQL — never in the
 * application layer — so large datasets remain performant.
 */
export interface LeadsFilter {
  /** Free-text search across first_name, last_name, email, phone, company_name. */
  search?: string;
  /** Restrict results to leads with one of the given statuses. */
  status?: LeadStatus[];
  /** Restrict results to leads with one of the given sources. */
  source?: LeadSource[];
  /**
   * Filter by owner: a member user_id returns only leads assigned to that user;
   * the special value "unassigned" returns only leads where owner_id IS NULL.
   */
  ownerId?: string;
  /** Field to sort by (default: created_at). */
  sortBy?: LeadSortField;
  /** Sort direction (default: desc). */
  sortOrder?: LeadSortOrder;
  /**
   * When true, exclude ingest-created channel stub leads (Unknown Customer
   * with empty email and phone). Heuristic — see isChannelStubLead.
   */
  excludeChannelStubs?: boolean;
}

/**
 * Returns leads belonging to the given organization, with pagination and
 * optional server-side search, filtering, and sorting.
 *
 * Steps:
 *   1. requireOrgMembership — verifies the user belongs to the org.
 *   2. Supabase query scoped to organizationId — application-layer filter.
 *   3. Optional search / status / source filters applied in PostgreSQL.
 *   4. PostgreSQL RLS — independent DB-layer filter using auth_user_role_in_org().
 *
 * Defaults to page 1, limit 20, ordered newest-first when no options are provided.
 */
export async function listLeads(
  organizationId: string,
  userId: string,
  pagination: LeadsPagination = { page: 1, limit: 20 },
  filter: LeadsFilter = {}
): Promise<Lead[]> {
  await requireOrgMembership(organizationId, userId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const supabase = await createClient();

  // Start with the base query scoped to this organization.
  // The type annotation keeps TypeScript happy across the conditional chain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("leads")
    .select("*")
    .eq("organization_id", organizationId);

  // Free-text search — ilike across multiple text columns.
  // Special PostgreSQL wildcard characters are escaped in user input.
  if (filter.search?.trim()) {
    const s = filter.search.trim().replace(/[%_\\]/g, "\\$&");
    query = query.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,company_name.ilike.%${s}%`
    );
  }

  if (filter.status?.length) {
    query = query.in("status", filter.status);
  }

  if (filter.source?.length) {
    query = query.in("source", filter.source);
  }

  if (filter.ownerId === "unassigned") {
    query = query.is("owner_id", null);
  } else if (filter.ownerId) {
    query = query.eq("owner_id", filter.ownerId);
  }

  if (filter.excludeChannelStubs) {
    query = query.or(CHANNEL_STUB_LEAD_EXCLUDE_OR);
  }

  const sortField = filter.sortBy ?? "created_at";
  const ascending = filter.sortOrder === "asc";

  const { data, error } = (await query
    .order(sortField, { ascending })
    .range(offset, offset + limit - 1)) as {
    data: Lead[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`Failed to fetch leads: ${error.message}`);
  }

  return (data ?? []) as Lead[];
}

/**
 * Returns a single lead by ID, verified to belong to the given organization.
 *
 * Steps:
 *   1. requireOrgMembership — verifies the user belongs to the org.
 *   2. Supabase query filtered by BOTH id AND organization_id.
 *      The organization_id filter prevents cross-tenant ID collisions from
 *      returning another tenant's lead: if the lead exists but belongs to a
 *      different org, the query returns no rows and NotFoundError is thrown.
 *   3. PostgreSQL RLS — independent DB-layer filter.
 *
 * Throws NotFoundError for:
 *   - a lead that does not exist
 *   - a lead that belongs to a different organization (no data leakage)
 */
export async function getLead(
  leadId: string,
  organizationId: string,
  userId: string | null
): Promise<Lead> {
  if (userId !== null) {
    await requireOrgMembership(organizationId, userId);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Lead");
  }

  return data as Lead;
}
