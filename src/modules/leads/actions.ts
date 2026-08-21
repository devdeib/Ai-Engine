/**
 * Lead domain mutations — create, update, delete.
 *
 * Security contract (identical to queries.ts):
 * 1. Accept organizationId + userId as explicit parameters.
 * 2. Call requireOrgMembership() first — application-layer tenant gate.
 * 3. Validate all caller-supplied input with Zod before touching the DB.
 * 4. Inject organization_id server-side; never accept it from caller input.
 * 5. Scope every DB operation to the verified organizationId.
 * 6. PostgreSQL RLS provides a second, independent enforcement layer:
 *    - INSERT WITH CHECK: auth_user_role_in_org(organization_id) IS NOT NULL
 *    - UPDATE USING/WITH CHECK: same — prevents cross-tenant moves
 *    - DELETE USING: auth_user_role_in_org(organization_id) IN ('owner','admin')
 *
 * NOTE: This file uses `import "server-only"` — it is a domain-layer module
 * callable from API routes, Server Actions, and future AI tools.
 * It does NOT use `"use server"` because it is not a Next.js Server Action.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  requireOrgMembership,
  isMemberOfOrg,
} from "@/modules/organizations/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createLeadSchema, updateLeadSchema } from "@/modules/leads/schema";
import type { Lead } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// createLead
// ---------------------------------------------------------------------------

/**
 * Creates a new Lead scoped to the verified organization.
 *
 * The organization_id on the inserted row always comes from the verified
 * organizationId parameter — never from the caller's input payload.
 * The createLeadSchema cannot produce an organization_id field, so
 * no client-supplied value can reach the database.
 */
export async function createLead(
  organizationId: string,
  userId: string,
  input: unknown
): Promise<Lead> {
  await requireOrgMembership(organizationId, userId);

  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid lead data",
      parsed.error.flatten().fieldErrors
    );
  }

  // If an owner_id is provided, verify it belongs to the same organization.
  // This prevents cross-tenant owner assignment even if the UUID is valid.
  if (parsed.data.owner_id) {
    const ownerIsValid = await isMemberOfOrg(organizationId, parsed.data.owner_id);
    if (!ownerIsValid) {
      throw new ValidationError("Invalid lead data", {
        owner_id: ["Owner must be a member of this organization"],
      });
    }
  }

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("leads") as any;
  const { data, error } = await table
    .insert({
      ...parsed.data,
      organization_id: organizationId, // always from verified context
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create lead: ${error?.message}`);
  }

  return data as Lead;
}

// ---------------------------------------------------------------------------
// updateLead
// ---------------------------------------------------------------------------

/**
 * Updates an existing Lead.
 *
 * The lead is looked up by BOTH id AND organization_id to prevent
 * cross-tenant access.  If the lead belongs to another organization the
 * query finds no rows and NotFoundError is thrown — indistinguishable from
 * "lead does not exist" (no information leakage).
 *
 * organization_id is absent from updateLeadSchema — it cannot appear in
 * parsed.data.  The DB-layer UPDATE policy also enforces this via
 * `WITH CHECK (auth_user_role_in_org(organization_id) IS NOT NULL)`.
 */
export async function updateLead(
  leadId: string,
  organizationId: string,
  userId: string,
  input: unknown
): Promise<Lead> {
  await requireOrgMembership(organizationId, userId);

  const parsed = updateLeadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid lead data",
      parsed.error.flatten().fieldErrors
    );
  }

  // If owner_id is explicitly set to a non-null UUID, verify same-org membership.
  // - undefined → field not included in update; skip validation
  // - null      → clearing the owner; always allowed
  // - UUID      → must belong to this organization
  if (parsed.data.owner_id !== undefined && parsed.data.owner_id !== null) {
    const ownerIsValid = await isMemberOfOrg(organizationId, parsed.data.owner_id);
    if (!ownerIsValid) {
      throw new ValidationError("Invalid lead data", {
        owner_id: ["Owner must be a member of this organization"],
      });
    }
  }

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("leads") as any;
  const { data, error } = await table
    .update(parsed.data)
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new NotFoundError("Lead");
  }

  return data as Lead;
}

// ---------------------------------------------------------------------------
// deleteLead
// ---------------------------------------------------------------------------

/**
 * Deletes a Lead.
 *
 * The application verifies that the caller is at minimum a member of the
 * organization (any role).  The database DELETE policy then enforces the
 * stricter restriction:
 *
 *   USING (auth_user_role_in_org(organization_id) IN ('owner', 'admin'))
 *
 * If the caller is a plain `agent`, the RLS policy makes the row invisible
 * to the DELETE operation — 0 rows are affected.  We detect this via
 * `.select("id")` and throw NotFoundError, which covers:
 *   - Lead does not exist
 *   - Lead belongs to a different organization
 *   - RLS blocked the delete (non-owner/admin caller)
 *
 * All three cases are indistinguishable to the caller — no privilege leakage.
 * The service-role key is NOT used.
 */
export async function deleteLead(
  leadId: string,
  organizationId: string,
  userId: string
): Promise<void> {
  await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("leads") as any;
  const { data, error } = await table
    .delete()
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .select("id");

  if (error) {
    throw new Error(`Failed to delete lead: ${error.message}`);
  }

  // 0 rows: lead not found, wrong org, or RLS blocked (non-owner/admin).
  if (!data || (data as { id: string }[]).length === 0) {
    throw new NotFoundError("Lead");
  }
}
