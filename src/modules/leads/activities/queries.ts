/**
 * Lead activity domain operations — list and create.
 *
 * Security contract (identical to the lead domain layer):
 * 1. Accept organizationId + userId as explicit parameters.
 * 2. Call requireOrgMembership() first — application-layer tenant gate.
 * 3. Verify the target lead belongs to the verified organization before
 *    reading or writing activities.  This prevents cross-tenant activity
 *    creation: org A user → org B lead is rejected at the domain layer, not
 *    only at the DB foreign-key level (lead_id is globally unique).
 * 4. Inject organization_id and user_id from verified context; never accept
 *    them from caller-supplied input.
 * 5. PostgreSQL RLS provides a second, independent enforcement layer.
 *
 * Activities are append-only: there are no update or delete operations in
 * this module and no corresponding RLS policies on the database.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  createActivitySchema,
  recordActivitySchema,
} from "@/modules/leads/activities/schema";
import type { LeadActivity, LeadActivityType } from "@/lib/db/types";

export interface RecordLeadActivityParams {
  organizationId: string;
  userId: string;
  leadId: string;
  type: LeadActivityType;
  content: string;
}

export interface ActivitiesPagination {
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Verifies that leadId belongs to organizationId.
 * Throws NotFoundError if not — indistinguishable from "lead does not exist"
 * to prevent cross-tenant information leakage.
 */
async function assertLeadInOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

// ---------------------------------------------------------------------------
// listLeadActivities
// ---------------------------------------------------------------------------

/**
 * Returns the activity timeline for a lead, ordered newest-first.
 *
 * Steps:
 *   1. requireOrgMembership — application-layer tenant gate.
 *   2. assertLeadInOrg — verifies the lead belongs to the verified org.
 *   3. Query lead_activities scoped to both organizationId and leadId.
 *   4. PostgreSQL RLS — independent DB-layer filter.
 */
export async function listLeadActivities(
  organizationId: string,
  userId: string,
  leadId: string,
  pagination: ActivitiesPagination = { page: 1, limit: 20 }
): Promise<LeadActivity[]> {
  await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();
  await assertLeadInOrg(supabase, leadId, organizationId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("lead_activities") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch activities: ${error.message}`);
  }

  return (data ?? []) as LeadActivity[];
}

// ---------------------------------------------------------------------------
// recordLeadActivity
// ---------------------------------------------------------------------------

/**
 * Internal CRM timeline writer used by conversations, follow-ups, appointments,
 * and the public createLeadActivity API.
 *
 * organizationId / userId / leadId always come from trusted server context.
 * Extra identity fields on a caller object cannot override those arguments.
 *
 * Failure semantics: throws on insert failure. Callers record activities only
 * after the primary mutation succeeds. There is no DB transaction wrapping
 * the pair — if this throws, the primary row already exists and the API
 * surfaces the error rather than returning success without a timeline event.
 */
export async function recordLeadActivity(
  params: RecordLeadActivityParams
): Promise<LeadActivity> {
  const { organizationId, userId, leadId } = params;
  await requireOrgMembership(organizationId, userId);

  const parsed = recordActivitySchema.safeParse({
    type: params.type,
    content: params.content,
  });
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid activity data",
      parsed.error.flatten().fieldErrors
    );
  }

  const supabase = await createClient();
  await assertLeadInOrg(supabase, leadId, organizationId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("lead_activities") as any)
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      user_id: userId,
      type: parsed.data.type,
      content: parsed.data.content,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create activity: ${error?.message}`);
  }

  return data as LeadActivity;
}

// ---------------------------------------------------------------------------
// createLeadActivity
// ---------------------------------------------------------------------------

/**
 * Public/manual activity append. Accepts only note/call/email/meeting/status_change.
 * Conversation, follow-up, and appointment events are recorded internally via
 * recordLeadActivity so clients cannot spoof those timeline rows.
 */
export async function createLeadActivity(
  organizationId: string,
  userId: string,
  leadId: string,
  input: unknown
): Promise<LeadActivity> {
  await requireOrgMembership(organizationId, userId);

  const parsed = createActivitySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid activity data",
      parsed.error.flatten().fieldErrors
    );
  }

  return recordLeadActivity({
    organizationId,
    userId,
    leadId,
    type: parsed.data.type,
    content: parsed.data.content,
  });
}
