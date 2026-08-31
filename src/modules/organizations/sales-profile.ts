/**
 * Organization sales-profile queries.
 *
 * Reads: any org member (or trusted channel_ingress with userId null).
 * Writes: owner/admin only.
 * Always scoped by organization_id. No admin client.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  requireOrgMembership,
  requireOrgRole,
} from "@/modules/organizations/queries";
import type { OrganizationSalesProfile } from "@/lib/db/types";
import {
  emptyOrganizationSalesProfile,
  type OrganizationSalesProfilePublic,
  type UpdateOrganizationSalesProfileInput,
} from "@/modules/organizations/sales-profile-schema";

const PUBLIC_SELECT =
  "offering_summary, service_area, qualification_criteria, constraints, typical_next_step";

function toPublic(
  row: Pick<
    OrganizationSalesProfile,
    | "offering_summary"
    | "service_area"
    | "qualification_criteria"
    | "constraints"
    | "typical_next_step"
  > | null
): OrganizationSalesProfilePublic {
  if (!row) {
    return emptyOrganizationSalesProfile();
  }
  return {
    offering_summary: row.offering_summary,
    service_area: row.service_area,
    qualification_criteria: row.qualification_criteria,
    constraints: row.constraints,
    typical_next_step: row.typical_next_step,
  };
}

async function fetchProfileRow(
  organizationId: string
): Promise<OrganizationSalesProfile | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("organization_sales_profiles") as any)
    .select(PUBLIC_SELECT)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load sales profile");
  }

  return (data as OrganizationSalesProfile | null) ?? null;
}

/**
 * Member (or trusted worker with userId null) read.
 * Missing row is an empty profile, not 404.
 */
export async function getOrganizationSalesProfile(
  organizationId: string,
  userId: string | null
): Promise<OrganizationSalesProfilePublic> {
  if (userId !== null) {
    await requireOrgMembership(organizationId, userId);
  }
  const row = await fetchProfileRow(organizationId);
  return toPublic(row);
}

/**
 * Owner/admin upsert. Partial PATCH: omitted keys keep existing values.
 * organization_id is taken only from the verified argument.
 */
export async function upsertOrganizationSalesProfile(
  organizationId: string,
  userId: string,
  patch: UpdateOrganizationSalesProfileInput
): Promise<OrganizationSalesProfilePublic> {
  await requireOrgRole(organizationId, userId, ["owner", "admin"]);

  const existing = await fetchProfileRow(organizationId);
  const next = {
    offering_summary:
      patch.offering_summary !== undefined
        ? patch.offering_summary
        : (existing?.offering_summary ?? null),
    service_area:
      patch.service_area !== undefined
        ? patch.service_area
        : (existing?.service_area ?? null),
    qualification_criteria:
      patch.qualification_criteria !== undefined
        ? patch.qualification_criteria
        : (existing?.qualification_criteria ?? null),
    constraints:
      patch.constraints !== undefined
        ? patch.constraints
        : (existing?.constraints ?? null),
    typical_next_step:
      patch.typical_next_step !== undefined
        ? patch.typical_next_step
        : (existing?.typical_next_step ?? null),
  };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("organization_sales_profiles") as any;

  if (existing) {
    const { data, error } = await table
      .update(next)
      .eq("organization_id", organizationId)
      .select(PUBLIC_SELECT)
      .single();

    if (error || !data) {
      throw new Error("Failed to update sales profile");
    }
    return toPublic(data as OrganizationSalesProfile);
  }

  const { data, error } = await table
    .insert({ organization_id: organizationId, ...next })
    .select(PUBLIC_SELECT)
    .single();

  if (error || !data) {
    throw new Error("Failed to create sales profile");
  }
  return toPublic(data as OrganizationSalesProfile);
}
